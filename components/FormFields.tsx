// 編集画面共通のフォーム部品。Server Actionsのform actionでそのまま使えるよう、
// クライアントコンポーネント化はしていない（JS無効でも送信できるプログレッシブエンハンスメント）。

export function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded border border-gray-300 bg-white p-4">
      <h2 className="mb-1 font-semibold text-gray-700">{title}</h2>
      {note && <p className="mb-3 text-xs text-gray-400">{note}</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">{children}</div>
    </section>
  );
}

type FieldProps = {
  name: string;
  label: string;
  defaultValue?: string | number | null;
  required?: boolean;
  placeholder?: string;
};

export function TextField({ name, label, defaultValue, required, placeholder }: FieldProps) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs text-gray-500">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      <input
        type="text"
        name={name}
        defaultValue={defaultValue ?? ""}
        required={required}
        placeholder={placeholder}
        className="w-full rounded border border-gray-300 px-2 py-1.5"
      />
    </label>
  );
}

export function NumberField({ name, label, defaultValue, required, step = "any" }: FieldProps & { step?: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs text-gray-500">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      <input
        type="number"
        step={step}
        name={name}
        defaultValue={defaultValue ?? ""}
        required={required}
        className="w-full rounded border border-gray-300 px-2 py-1.5"
      />
    </label>
  );
}

export function DateField({ name, label, defaultValue, required }: FieldProps) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs text-gray-500">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      <input
        type="date"
        name={name}
        defaultValue={defaultValue ?? ""}
        required={required}
        className="w-full rounded border border-gray-300 px-2 py-1.5"
      />
    </label>
  );
}

export function TextAreaField({ name, label, defaultValue }: FieldProps) {
  return (
    <label className="block text-sm sm:col-span-2 md:col-span-3">
      <span className="mb-1 block text-xs text-gray-500">{label}</span>
      <textarea
        name={name}
        defaultValue={defaultValue ?? ""}
        rows={3}
        className="w-full rounded border border-gray-300 px-2 py-1.5"
      />
    </label>
  );
}

export function SelectField({
  name,
  label,
  defaultValue,
  options,
  required,
  includeBlank = true,
}: FieldProps & { options: Record<string, string>; includeBlank?: boolean }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs text-gray-500">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      <select
        name={name}
        defaultValue={defaultValue ?? ""}
        required={required}
        className="w-full rounded border border-gray-300 px-2 py-1.5"
      >
        {includeBlank && <option value="">（未選択）</option>}
        {Object.entries(options).map(([value, optLabel]) => (
          <option key={value} value={value}>
            {optLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

export function CheckboxField({
  name,
  label,
  defaultChecked,
}: {
  name: string;
  label: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="h-4 w-4" />
      {label}
    </label>
  );
}
