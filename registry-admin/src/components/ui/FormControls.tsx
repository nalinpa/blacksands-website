import type React from "react";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={[
        "mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder-slate-400 shadow-sm",
        "outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400",
        props.className ?? "",
      ].join(" ")}
    />
  );
}

export function PrimaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={[
        "rounded-xl bg-indigo-600 px-4 py-2.5 text-white font-medium shadow-sm hover:bg-indigo-500",
        "disabled:opacity-60 disabled:cursor-not-allowed",
        props.className ?? "",
      ].join(" ")}
    />
  );
}

export function SecondaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={[
        "rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-slate-700 font-medium hover:bg-slate-100",
        props.className ?? "",
      ].join(" ")}
    />
  );
}
