/**
 * Byte offsets of account fields, computed from the IDL (never hand-counted), for
 * `getProgramAccounts` memcmp filters. All Manifest accounts are fixed-size.
 */
import { IDL } from "./idl/idl.js";

type IdlType =
  | string
  | { array: readonly [IdlType, number] }
  | { defined: { name: string } }
  | { option: IdlType };

type IdlField = { readonly name: string; readonly type: IdlType };
type IdlTypeDef = {
  readonly name: string;
  readonly type:
    | { readonly kind: "struct"; readonly fields: readonly IdlField[] }
    | {
        readonly kind: "enum";
        readonly variants: readonly { readonly name: string; readonly fields?: unknown }[];
      };
};

const PRIMITIVE_SIZES: Record<string, number> = {
  bool: 1,
  u8: 1,
  i8: 1,
  u16: 2,
  i16: 2,
  u32: 4,
  i32: 4,
  u64: 8,
  i64: 8,
  u128: 16,
  i128: 16,
  pubkey: 32,
};

/** Anchor account discriminator length. */
export const DISCRIMINATOR_LEN = 8;

const types = IDL.types as readonly IdlTypeDef[];

function typeDef(name: string): IdlTypeDef {
  const def = types.find((t) => t.name === name);
  if (!def) throw new Error(`IDL type ${name} not found`);
  return def;
}

export function sizeOf(type: IdlType): number {
  if (typeof type === "string") {
    const size = PRIMITIVE_SIZES[type];
    if (size === undefined) throw new Error(`Variable-size IDL type ${type}`);
    return size;
  }
  if ("array" in type) return sizeOf(type.array[0]) * type.array[1];
  if ("defined" in type) {
    const def = typeDef(type.defined.name);
    if (def.type.kind === "enum") {
      if (def.type.variants.some((v) => v.fields !== undefined)) {
        throw new Error(`Enum ${def.name} has data; not fixed-size`);
      }
      return 1;
    }
    return def.type.fields.reduce((n, f) => n + sizeOf(f.type), 0);
  }
  throw new Error(`Unsupported IDL type ${JSON.stringify(type)}`);
}

/** Offset of `field` inside account `account` (including the 8-byte discriminator). */
export function fieldOffset(account: string, field: string): number {
  const def = typeDef(account);
  if (def.type.kind !== "struct") throw new Error(`${account} is not a struct`);
  let offset = DISCRIMINATOR_LEN;
  for (const f of def.type.fields) {
    if (f.name === field) return offset;
    offset += sizeOf(f.type);
  }
  throw new Error(`Field ${account}.${field} not found`);
}

/** Total account size including the discriminator. */
export function accountSize(account: string): number {
  return DISCRIMINATOR_LEN + sizeOf({ defined: { name: account } });
}

/** Index of an enum variant by its IDL (PascalCase) or camelCase name. */
export function enumIndex(enumName: string, variant: string): number {
  const def = typeDef(enumName);
  if (def.type.kind !== "enum") throw new Error(`${enumName} is not an enum`);
  const i = def.type.variants.findIndex((v) => v.name.toLowerCase() === variant.toLowerCase());
  if (i < 0) throw new Error(`${enumName}.${variant} not found`);
  return i;
}
