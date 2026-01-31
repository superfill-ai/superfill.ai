export type AuthSuccessMessage = {
  type: "SUPERFILL_AUTH_SUCCESS";
  access_token: string;
  refresh_token: string;
  user: {
    id: string;
    email?: string;
  };
};

export type Message<T = Record<string, unknown>> = {
  type: string;
} & T;
