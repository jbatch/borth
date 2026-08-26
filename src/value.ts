export type Address = {
  kind: "address";
  index: number;
};

export type ArrayValue = {
  kind: "array";
  items: Value[];
};

export type Value = number | string | Address | ArrayValue;
