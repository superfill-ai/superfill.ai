import { describe, expect, test } from "bun:test";
import { normalizeDOMField } from "@/lib/autofill/normalized-field";
import { installDom, requiredElement } from "./dom-fixture";
import {
  createService,
  detectDocument,
  detectSerializedFrame,
  detectWithService,
  handleFill,
} from "./form-test-helpers";

describe("form parsing fixtures", () => {
  test("scopes frame snapshots while preserving duplicate highlight indices across frames", async () => {
    const firstFrame = await detectSerializedFrame(
      `
        <form id="profile">
          <label for="name">Name</label>
          <input id="name" name="name" autocomplete="name" />
        </form>
      `,
      17,
    );

    const secondFrame = await detectSerializedFrame(
      `
        <form id="profile">
          <label for="name">Name</label>
          <input id="name" name="name" autocomplete="name" />
        </form>
      `,
      42,
    );

    const fields = [...firstFrame, ...secondFrame].flatMap(
      (form) => form.fields,
    );

    expect(fields.map((field) => field.frameId)).toEqual([17, 42]);
    expect(fields.map((field) => field.highlightIndex)).toEqual([0, 0]);
    expect(new Set(fields.map((field) => field.opid)).size).toBe(2);
  });

  test("keeps duplicate labels when they belong to separate forms", async () => {
    const { fields } = await detectDocument(`
      <form id="personal">
        <label for="personal-email">Email</label>
        <input id="personal-email" name="email" type="email" />
      </form>
      <form id="work">
        <label for="work-email">Email</label>
        <input id="work-email" name="email" type="email" />
      </form>
    `);

    expect(fields.map((field) => field.formOpid)).toHaveLength(2);
    expect(fields.map((field) => field.metadata.labelTag)).toEqual([
      "Email",
      "Email",
    ]);
  });

  test("preserves autocomplete token granularity for names and address lines", async () => {
    const { fields } = await detectDocument(`
      <form id="granular">
        <label for="first">First name</label>
        <input id="first" autocomplete="section-blue shipping given-name" />
        <label for="last">Last name</label>
        <input id="last" autocomplete="family-name" />
        <label for="address1">Address line 1</label>
        <input id="address1" autocomplete="address-line1" />
        <label for="address2">Street 2</label>
        <input id="address2" />
      </form>
    `);

    expect(fields.map((field) => field.metadata.fieldPurpose)).toEqual([
      "name.first",
      "name.last",
      "address.line1",
      "address.line2",
    ]);
    expect(normalizeDOMField(fields[0]).autocompleteTokens).toEqual([
      "section-blue",
      "shipping",
      "given-name",
    ]);
  });

  test("detects checkbox and radio controls from the DOM path", async () => {
    const { fields } = await detectDocument(`
      <form id="preferences">
        <label for="subscribe">Subscribe</label>
        <input id="subscribe" name="subscribe" type="checkbox" />
        <fieldset>
          <legend>Contact preference</legend>
          <label for="email-pref">Email</label>
          <input id="email-pref" name="contact" type="radio" value="email" />
        </fieldset>
      </form>
    `);

    expect(fields.map((field) => field.metadata.fieldType)).toEqual([
      "checkbox",
      "radio",
    ]);
  });

  test("rebuilds the dynamic form cache when the DOM changes", async () => {
    installDom(
      `
        <form id="step-one">
          <label for="name">Name</label>
          <input id="name" name="name" autocomplete="name" />
        </form>
      `,
      "https://fixture.test/step-one",
    );
    const service = createService();
    await detectWithService(service);

    document.body.innerHTML = `
      <form id="step-two">
        <label for="email">Email</label>
        <input id="email" name="email" type="email" />
      </form>
    `;
    await detectWithService(service);

    expect(
      service.getCachedFields().map((field) => field.metadata.labelTag),
    ).toEqual(["Email"]);
  });

  test("does not reuse stale field IDs after the DOM cache rebuilds", async () => {
    installDom(
      `
        <form id="step-one">
          <label for="first">First</label>
          <input id="first" name="first" />
        </form>
      `,
      "https://fixture.test/stale-opid",
    );
    const service = createService();
    const firstFields = (await detectWithService(service)).flatMap(
      (form) => form.fields,
    );
    const staleOpid = firstFields[0].opid;

    document.body.innerHTML = `
      <form id="step-two">
        <label for="last">Last</label>
        <input id="last" name="last" />
      </form>
    `;
    const secondFields = (await detectWithService(service)).flatMap(
      (form) => form.fields,
    );
    const last = requiredElement(document, "#last", HTMLInputElement);

    const result = await handleFill(
      [{ fieldOpid: staleOpid, value: "Stale" }],
      { isMainFrame: true },
      service,
    );

    expect(secondFields[0].opid).not.toBe(staleOpid);
    expect(result.ok).toBe(false);
    expect(result.outcomes[0]?.status).toBe("skipped");
    expect(last.value).toBe("");
  });

  test("keeps current values for partially-filled fields", async () => {
    const { fields } = await detectDocument(`
      <form id="partial">
        <label for="first">First name</label>
        <input id="first" autocomplete="given-name" value="Mi" />
        <label for="last">Last name</label>
        <input id="last" autocomplete="family-name" />
      </form>
    `);

    expect(fields.map((field) => field.metadata.currentValue)).toEqual([
      "Mi",
      "",
    ]);
  });
});
