import { describe, expect, test } from "bun:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { installDom, requiredElement } from "./dom-fixture";
import {
  createService,
  detectDocument,
  detectWithService,
  handleFill,
} from "./form-test-helpers";

describe("form filling fixtures", () => {
  test("verifies React-controlled text input after fill", async () => {
    installDom('<main id="root"></main>', "https://fixture.test/react-fill");
    const rootElement = requiredElement(document, "#root", HTMLElement);
    const root = createRoot(rootElement);

    await act(async () => {
      root.render(<ControlledNameInput />);
    });

    const service = createService();
    const fields = (await detectWithService(service)).flatMap(
      (form) => form.fields,
    );
    const input = requiredElement(document, "#react-name", HTMLInputElement);

    await act(async () => {
      await handleFill(
        [{ fieldOpid: fields[0].opid, value: "Mira" }],
        { isMainFrame: true },
        service,
      );
    });

    expect(input.value).toBe("Mira");
    expect(
      requiredElement(document, "[data-testid='react-value']", HTMLElement)
        .textContent,
    ).toBe("Mira");

    await act(async () => {
      root.unmount();
    });
  });

  test("fills native select controls by option label", async () => {
    const { service, fields } = await detectDocument(`
      <form id="country-form">
        <label for="country">Country</label>
        <select id="country" name="country">
          <option value="">Choose</option>
          <option value="us">United States</option>
          <option value="in">India</option>
        </select>
      </form>
    `);
    const select = requiredElement(document, "#country", HTMLSelectElement);
    const events: string[] = [];
    select.addEventListener("input", () => events.push("input"));
    select.addEventListener("change", () => events.push("change"));

    await handleFill(
      [{ fieldOpid: fields[0].opid, value: "United States" }],
      { isMainFrame: true },
      service,
    );

    expect(select.value).toBe("us");
    expect(events).toEqual(["input", "change"]);
  });

  test("fills checkbox controls with verified input and change events", async () => {
    const { service, fields } = await detectDocument(`
      <form id="newsletter-form">
        <label for="newsletter">Send product updates</label>
        <input id="newsletter" name="newsletter" type="checkbox" />
      </form>
    `);
    const checkbox = requiredElement(document, "#newsletter", HTMLInputElement);
    const events: string[] = [];
    checkbox.addEventListener("input", () => events.push("input"));
    checkbox.addEventListener("change", () => events.push("change"));

    await handleFill(
      [{ fieldOpid: fields[0].opid, value: "true" }],
      { isMainFrame: true },
      service,
    );

    expect(checkbox.checked).toBe(true);
    expect(events).toEqual(["input", "change"]);
  });

  test("fills a radio group by matching a sibling option value", async () => {
    const { service, fields } = await detectDocument(`
      <form id="contact-form">
        <fieldset>
          <legend>Preferred contact</legend>
          <label for="contact-email">Email</label>
          <input id="contact-email" name="contact" type="radio" value="email" />
          <label for="contact-phone">Phone</label>
          <input id="contact-phone" name="contact" type="radio" value="phone" />
        </fieldset>
      </form>
    `);
    const email = requiredElement(document, "#contact-email", HTMLInputElement);
    const phone = requiredElement(document, "#contact-phone", HTMLInputElement);
    const events: string[] = [];
    phone.addEventListener("input", () => events.push("input"));
    phone.addEventListener("change", () => events.push("change"));

    await handleFill(
      [{ fieldOpid: fields[0].opid, value: "phone" }],
      { isMainFrame: true },
      service,
    );

    expect(email.checked).toBe(false);
    expect(phone.checked).toBe(true);
    expect(events).toEqual(["input", "change"]);
  });

  test("does not report radio false as verified while another option is selected", async () => {
    const { service, fields } = await detectDocument(`
      <form id="contact-form">
        <label for="contact-email">Email</label>
        <input id="contact-email" name="contact" type="radio" value="email" checked />
        <label for="contact-phone">Phone</label>
        <input id="contact-phone" name="contact" type="radio" value="phone" />
      </form>
    `);
    const email = requiredElement(document, "#contact-email", HTMLInputElement);

    const result = await handleFill(
      [{ fieldOpid: fields[0].opid, value: "false" }],
      { isMainFrame: true },
      service,
    );

    expect(email.checked).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.outcomes[0]?.status).toBe("skipped");
    expect(result.outcomes[0]?.verified).toBe(false);
  });

  test("returns skipped outcomes when a field is missing from the cache", async () => {
    const { fields } = await detectDocument(`
      <form id="missing-cache">
        <label for="name">Name</label>
        <input id="name" name="name" />
      </form>
    `);
    const emptyService = createService();

    const result = await handleFill(
      [{ fieldOpid: fields[0].opid, value: "Mira" }],
      { isMainFrame: true },
      emptyService,
    );

    expect(result.ok).toBe(false);
    expect(result.skipped).toBe(1);
    expect(result.outcomes[0]?.status).toBe("skipped");
  });

  test("returns skipped outcomes when a cached field is detached before fill", async () => {
    const { service, fields } = await detectDocument(`
      <form id="detached-cache">
        <label for="name">Name</label>
        <input id="name" name="name" />
      </form>
    `);
    document.body.innerHTML = `
      <form id="new-form">
        <label for="new-name">Name</label>
        <input id="new-name" name="name" />
      </form>
    `;
    const newName = requiredElement(document, "#new-name", HTMLInputElement);

    const result = await handleFill(
      [{ fieldOpid: fields[0].opid, value: "Mira" }],
      { isMainFrame: true },
      service,
    );

    expect(newName.value).toBe("");
    expect(result.ok).toBe(false);
    expect(result.skipped).toBe(1);
    expect(result.outcomes[0]?.reason).toBe(
      "Field is no longer connected to the DOM",
    );
  });

  test("returns failed outcomes when DOM fill verification does not match", async () => {
    const { service, fields } = await detectDocument(`
      <form id="invalid-select">
        <label for="country">Country</label>
        <select id="country" name="country">
          <option value="">Choose</option>
          <option value="in">India</option>
        </select>
      </form>
    `);

    const result = await handleFill(
      [{ fieldOpid: fields[0].opid, value: "United States" }],
      { isMainFrame: true },
      service,
    );

    expect(result.ok).toBe(false);
    expect(result.failed).toBe(1);
    expect(result.outcomes[0]?.status).toBe("failed");
  });
});

function ControlledNameInput(): React.ReactElement {
  const [value, setValue] = React.useState("");
  const updateValue = (event: React.FormEvent<HTMLInputElement>): void => {
    setValue(event.currentTarget.value);
  };

  return (
    <form id="react-form">
      <label htmlFor="react-name">Name</label>
      <input
        id="react-name"
        name="name"
        value={value}
        onInput={updateValue}
        onChange={updateValue}
      />
      <output data-testid="react-value">{value}</output>
    </form>
  );
}
