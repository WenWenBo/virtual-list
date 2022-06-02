import React, { FunctionComponent } from "react";

interface ButtonProps
  extends React.DetailedHTMLProps<
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    HTMLButtonElement
  > {
  backgroundcolor: string;
  color: string;
}

export const Button: FunctionComponent<ButtonProps> = (props) => {
  const { children, backgroundcolor, color, style } = props;

  let _style: React.CSSProperties = style || {};

  if (backgroundcolor) _style.backgroundColor = backgroundcolor;
  if (color) _style.color = color;
  return (
    <button style={_style} {...props}>
      {children}
    </button>
  );
};
