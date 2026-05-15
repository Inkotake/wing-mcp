/** Shared schema fragments for tool input schemas. Use to avoid drift. */

export const ConfirmationIdField = {
  confirmation_id: {
    type: "string",
    description: "Confirmation ID returned by the matching prepare tool.",
  },
} as const;

export const ConfirmationTextField = {
  confirmation_text: {
    type: "string",
    description: "Exact confirmation text spoken/typed by the user. Required by server for high/critical risk actions.",
  },
} as const;

/** Apply both confirmation fields to an existing properties object */
export function withConfirmationFields(props: Record<string, unknown>): Record<string, unknown> {
  return { ...props, ...ConfirmationIdField, ...ConfirmationTextField };
}
