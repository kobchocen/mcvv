"use client";

import type { ComponentProps } from "react";

/**
 * Native select that submits its GET form on change (e.g. year switch in admin lists).
 * Without JavaScript the form's own submit button still works.
 */
export function AutoSubmitSelect(props: ComponentProps<"select">) {
  return (
    <select
      {...props}
      onChange={(event) => {
        props.onChange?.(event);
        event.currentTarget.form?.requestSubmit();
      }}
    />
  );
}
