import React from "react";

type AnyProps = Record<string, unknown> & { children?: React.ReactNode };
type AnyComponent = React.ComponentType<AnyProps>;

type StyleSheetApi = {
  create: <T extends Record<string, unknown>>(styles: T) => T;
};

export type GrinSurfaces = {
  Screen: AnyComponent;
  Header: AnyComponent;
  Banner: AnyComponent;
  Button: AnyComponent;
  FormSection: AnyComponent;
  TextField: AnyComponent;
  SelectField: AnyComponent;
  Card: AnyComponent;
  EmptyState: AnyComponent;
  View: AnyComponent;
  Text: AnyComponent;
  FlatList: AnyComponent;
  IndigoChoiceChip: AnyComponent;
  IndigoChoiceChipRow: AnyComponent;
  StyleSheet: StyleSheetApi;
  Platform: { OS: string };
  useSafeAreaInsets: () => { top: number; bottom: number; left: number; right: number };
};

const identitySheet: StyleSheetApi = {
  create: (styles) => styles,
};

let surfaces: GrinSurfaces | null = null;

export function installGrinSurfaces(next: GrinSurfaces): void {
  surfaces = next;
}

export function getGrinSurfaces(): GrinSurfaces {
  if (!surfaces) {
    throw new Error("grin_surfaces_unbound");
  }
  return surfaces;
}

function wrap(name: keyof GrinSurfaces): AnyComponent {
  const Comp = (props: AnyProps) => {
    const impl = getGrinSurfaces()[name];
    return React.createElement(impl as AnyComponent, props);
  };
  Comp.displayName = `GrinSurface.${String(name)}`;
  return Comp;
}

export const Screen = wrap("Screen");
export const Header = wrap("Header");
export const Banner = wrap("Banner");
export const Button = wrap("Button");
export const FormSection = wrap("FormSection");
export const TextField = wrap("TextField");
export const SelectField = wrap("SelectField");
export const Card = wrap("Card");
export const EmptyState = wrap("EmptyState");
export const View = wrap("View");
export const Text = wrap("Text");
export const FlatList = wrap("FlatList");
export const IndigoChoiceChip = wrap("IndigoChoiceChip");
export const IndigoChoiceChipRow = wrap("IndigoChoiceChipRow");

export const StyleSheet: StyleSheetApi = {
  create(styles) {
    return (surfaces?.StyleSheet ?? identitySheet).create(styles);
  },
};

export const Platform = {
  get OS() {
    return surfaces?.Platform.OS ?? "web";
  },
};

export function useSafeAreaInsets(): { top: number; bottom: number; left: number; right: number } {
  return getGrinSurfaces().useSafeAreaInsets();
}
