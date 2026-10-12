// ErrorMessage.jsx - the tangerine error box. Shows nothing when `text` is empty.
export default function ErrorMessage({ text }) {
  if (!text) return null;
  return <p className="msg msg-error" role="alert">{text}</p>;
}
