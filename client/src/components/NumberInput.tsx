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
 * And typing after a shown 0 gives "0233", which React leaves on screen
 * because it already equals 233. This keeps the typed text locally as a
 * string (so React does redraw it), drops leading zeros, reports only real
 * numbers, and puts the last value back if the box is left empty.
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
        // Typing after a shown 0 gives "0233"; drop the zero so the box reads 233.
        const typed = e.target.value.replace(/^0+(?=\d)/, '');
        setText(typed);
        if (typed !== '' && !Number.isNaN(Number(typed))) onValueChange(Number(typed));
      }}
      onBlur={(e) => {
        if (text === '') setText(value == null ? '' : String(value));
        onBlur?.(e);
      }}
    />
  );
}
