export type Address = {
  kind: "address";
  index: number;
};

export type ArrayValue = {
  kind: "array";
  items: Value[];
};

export type ArrayBuilderValue = {
  kind: "array-builder";
  items: Value[];
  frozen: boolean;
};

export type StringBuilderValue = {
  kind: "string-builder";
  chunks: string[];
  length: number;
  frozen: boolean;
};

export type MapValue = {
  kind: "map";
  items: Map<string, { key: Value; value: Value }>;
};

export type Value =
  | number
  | string
  | Address
  | ArrayValue
  | ArrayBuilderValue
  | StringBuilderValue
  | MapValue;
