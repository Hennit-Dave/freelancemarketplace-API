'use client';

import { useEffect, useState } from 'react';

const API_URL = 'https://freelancemarketplaceapi.vercel.app/api/v1/gigs';
const PAGE_SIZE = 10;
const CATEGORIES = ['writing', 'design', 'development', 'marketing', 'video'];

type Gig = {
  id: string;
  title: string;
  description: string;
  category: string;
  priceMinor: number;
  currency: string;
  deliveryDays: number;
};
type Meta = { total: number; limit: number; offset: number; hasMore: boolean };

function formatPrice(minor: number, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(minor / 100);
}

export default function ConsumerPage() {
  const [category, setCategory] = useState('');
  const [offset, setOffset] = useState(0);
  const [gigs, setGigs] = useState<Gig[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
    if (category) params.set('category', category);
    setLoading(true);
    setError(null);
    fetch(`${API_URL}?${params}`, { signal: controller.signal })
      .then(async res => {
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error?.message ?? `Request failed (${res.status})`);
        setGigs(body.data);
        setMeta(body.meta);
      })
      .catch(err => {
        if (err.name !== 'AbortError') setError(err.message ?? 'Request failed');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [category, offset]);

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: 16 }}>
      <h1>Gigs</h1>
      <label>
        Category{' '}
        <select
          value={category}
          onChange={e => {
            setCategory(e.target.value);
            setOffset(0);
          }}
        >
          <option value="">All categories</option>
          {CATEGORIES.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </label>

      {error && <p role="alert" style={{ color: 'crimson' }}>{error}</p>}
      {loading && <p>Loading…</p>}
      {!loading && !error && gigs.length === 0 && <p>No gigs found.</p>}

      <ul style={{ listStyle: 'none', padding: 0 }}>
        {gigs.map(gig => (
          <li key={gig.id} style={{ borderBottom: '1px solid #ddd', padding: '12px 0' }}>
            <strong>{gig.title}</strong>
            <div>
              {gig.category} · {formatPrice(gig.priceMinor, gig.currency)} · {gig.deliveryDays} day
              {gig.deliveryDays === 1 ? '' : 's'}
            </div>
            <p style={{ margin: '4px 0 0' }}>{gig.description}</p>
          </li>
        ))}
      </ul>

      {meta && (
        <p>
          Showing {meta.total === 0 ? 0 : meta.offset + 1}–{meta.offset + gigs.length} of {meta.total}
        </p>
      )}
      <button
        type="button"
        onClick={() => setOffset(o => o + PAGE_SIZE)}
        disabled={loading || !meta?.hasMore}
      >
        Next page
      </button>
    </main>
  );
}
