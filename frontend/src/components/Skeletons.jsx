// Skeletons.jsx - grey placeholder cards shown while a list is loading.
export default function Skeletons({ count = 12 }) {
  return (
    <div className="grid">
      {Array.from({ length: count }, (_, i) => <div key={i} className="skeleton" />)}
    </div>
  );
}
