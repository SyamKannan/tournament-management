import React, { useCallback, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { ApiError, type FieldErrors } from '../../services/api';

/**
 * The message under a field that caused a validation failure.
 *
 * A toast says *something* was wrong; this says *what*, next to where it is
 * fixed. `id` lets the input point at it with `aria-describedby`, so a screen
 * reader reads the problem when the field takes focus.
 */
export const FieldError: React.FC<{ id?: string; message?: string | null; className?: string }> = ({
  id,
  message,
  className = '',
}) => {
  if (!message) return null;

  return (
    <p id={id} role="alert" className={`mt-1.5 flex items-start gap-1.5 text-sm font-medium text-rose-400 ${className}`}>
      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </p>
  );
};

/**
 * Holds the per-field messages from the last failed submit.
 *
 * `capture(err)` takes whatever was thrown and keeps the field messages if it
 * was a validation failure — returning whether it did, so a caller can skip
 * the toast when the form already shows the problem in place. Editing a field
 * clears its message, so a fixed field stops shouting.
 */
export function useFieldErrors() {
  const [errors, setErrors] = useState<FieldErrors>({});

  const capture = useCallback((err: unknown): boolean => {
    if (err instanceof ApiError && Object.keys(err.fieldErrors).length > 0) {
      setErrors(err.fieldErrors);
      return true;
    }
    setErrors({});
    return false;
  }, []);

  const get = useCallback((path: string): string | undefined => {
    if (errors[path]?.length) return errors[path][0];
    const nested = Object.keys(errors).find(key => key.startsWith(`${path}.`));
    return nested ? errors[nested][0] : undefined;
  }, [errors]);

  const clear = useCallback((path?: string) => {
    setErrors(previous => {
      if (!path) return {};
      const next = { ...previous };
      for (const key of Object.keys(next)) {
        if (key === path || key.startsWith(`${path}.`)) delete next[key];
      }
      return next;
    });
  }, []);

  /** Props for an input: marks it invalid and links it to its message. */
  const inputProps = useCallback((path: string) => {
    const message = get(path);
    return message
      ? { 'aria-invalid': true as const, 'aria-describedby': `err-${path.replace(/\W+/g, '-')}` }
      : {};
  }, [get]);

  return { errors, capture, get, clear, inputProps, hasErrors: Object.keys(errors).length > 0 };
}

/** The id `inputProps` points at, for the matching `<FieldError id=…>`. */
export const fieldErrorId = (path: string) => `err-${path.replace(/\W+/g, '-')}`;
