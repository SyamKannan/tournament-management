import { useEffect, useState, type InputHTMLAttributes } from 'react';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> & {
  value: number | null | undefined;
  onValueChange: (value: number) => void;
};

/**
 * A number field that can be cleared while typing.
 *
 * `onChange={e => set(Number(e.target.value))}` turns an emptied box into 0,
 * so the 0 comes straight back and the next digit lands after it ("020").
 * This keeps the typed text locally, reports only real numbers, and puts the
 * last value back if the box is left empty.
 */
export default function NumberInput({ value, onValueChange, onBlur, ...rest }: Props) {
  const [text, setText] = useState(value == null ? '' : String(value));

  // Follow changes made from outside (loading a record, clamping to a limit)
  // without overwriting what is being typed when it already means that number.
  useEffect(() => {
    setText(current => (current !== '' && Number(current) === value ? current : value == null ? '' : String(value)));
  }, [value]);

  return (
    <input
      {...rest}
      type="number"
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        if (e.target.value !== '' && !Number.isNaN(Number(e.target.value))) onValueChange(Number(e.target.value));
      }}
      onBlur={(e) => {
        if (text === '') setText(value == null ? '' : String(value));
        onBlur?.(e);
      }}
    />
  );
}
