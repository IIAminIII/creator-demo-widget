export default function LoadingSpinner({ label = "Loading..." }) {
  return (
    <div className="flex min-h-48 items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="loading loading-spinner loading-lg text-primary" />
        <p className="text-sm text-base-content/70">{label}</p>
      </div>
    </div>
  );
}
