async function parse<T>(res: Response): Promise<T> {
  const data = (await res.json()) as T & { error?: string; message?: string };
  if (!res.ok || data.error) {
    throw new Error(data.message ?? data.error ?? "Falha na requisição.");
  }
  return data;
}

export async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  return parse<T>(res);
}

export async function postJson<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return parse<T>(res);
}

export async function patchJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return parse<T>(res);
}