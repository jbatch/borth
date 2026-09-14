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

export type Value = number | string | Address | ArrayValue | ArrayBuilderValue;
