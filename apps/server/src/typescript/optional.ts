export function optional<DefaultValue, T>(value: T | null | undefined, defaultValue: DefaultValue): T | DefaultValue {
  return value === null || value === undefined ? defaultValue : value;
}
