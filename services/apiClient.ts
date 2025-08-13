const apiFetch = async (url: string, options?: RequestInit) => {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error: any = new Error(data?.error || 'Request failed');
    error.status = res.status;
    throw error;
  }
  return data;
};

export default apiFetch;
