const API = import.meta.env.VITE_API_URL || 'http://localhost:3000';

function headers(extra = {}) {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

export async function post(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

export async function get(path) {
  const res = await fetch(`${API}${path}`, { headers: headers() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

export async function put(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

export async function del(path) {
  const res = await fetch(`${API}${path}`, { method: 'DELETE', headers: headers() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}
