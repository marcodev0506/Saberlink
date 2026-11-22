const API = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export async function post(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

export async function get(path) {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}
