interface SubmitButtonProps {
  readonly pending: boolean;
  readonly children: React.ReactNode;
  readonly pendingLabel: string;
}

export function SubmitButton({ pending, pendingLabel, children }: SubmitButtonProps) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded bg-black px-3 py-2 text-white disabled:opacity-50"
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
