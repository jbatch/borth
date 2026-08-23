export type Address = {
  kind: "address";
  index: number;
};

export type Value = number | string | Address;
