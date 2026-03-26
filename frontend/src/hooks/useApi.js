import { useState, useEffect, useCallback } from 'react';

const BASE = '/api';

function getAuthHeaders() {
  const token = localStorage.getItem('orqy_token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

export function useApi(path, deps = [], { pollInterval } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refetch = useCallback(async () => {
    if (!path) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading((prev) => data === null ? true : prev);
    try {
      const res = await fetch(`${BASE}${path}`, { headers: getAuthHeaders() });
      if (res.status === 401) {
        localStorage.removeItem('orqy_token');
        window.location.reload();
        return;
      }
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [path, ...deps]);

  useEffect(() => { refetch(); }, [refetch]);

  // Optional polling
  useEffect(() => {
    if (!pollInterval || !path) return;
    const interval = setInterval(refetch, pollInterval);
    return () => clearInterval(interval);
  }, [refetch, pollInterval, path]);

  return { data, loading, error, refetch };
}

export async function apiPost(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `${res.status} ${res.statusText}`);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  if (!text) return null;
  return JSON.parse(text);
}

export async function apiPut(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function apiDelete(path) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error(`${res.status}`);
}
