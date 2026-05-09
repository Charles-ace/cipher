export type RuntimeSnapshot = {
  siteName: string | null;
  siteUrl: string | null;
  now: string;
};

export async function fetchRuntimeSnapshot() {
  const response = await fetch("/.netlify/functions/runtime");

  if (!response.ok) {
    throw new Error(`Runtime endpoint returned ${response.status}`);
  }

  return (await response.json()) as RuntimeSnapshot;
}
