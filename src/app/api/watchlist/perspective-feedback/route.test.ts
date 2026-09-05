import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  parse: vi.fn(),
  save: vi.fn(),
  load: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  serverIsSupabaseConfigured: vi.fn(() => true),
  getServerSupabase: vi.fn(async () => ({ auth: { getUser: mocks.auth } })),
}));
vi.mock('@/lib/watchlist/perspective-feedback', () => ({
  parsePerspectiveFeedback: mocks.parse,
  savePerspectiveFeedback: mocks.save,
  loadPerspectiveAssessments: mocks.load,
  deletePerspectiveFeedback: mocks.remove,
}));

import { DELETE, GET, POST } from './route';

const perspectiveId = '123e4567-e89b-42d3-a456-426614174000';

describe('/api/watchlist/perspective-feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mocks.parse.mockReturnValue({ perspectiveId, verdict: 'helpful' });
    mocks.save.mockResolvedValue({ perspective_id: perspectiveId, verdict: 'helpful' });
    mocks.load.mockResolvedValue({
      [perspectiveId]: { feedback: { verdict: 'helpful' }, outcomes: [{ horizonDays: 30 }] },
    });
    mocks.remove.mockResolvedValue(undefined);
  });

  it('loads feedback and outcomes through the user-scoped repository', async () => {
    const response = await GET(new Request(`http://localhost/api/watchlist/perspective-feedback?perspectiveId=${perspectiveId}`));
    expect(response.status).toBe(200);
    expect(mocks.load).toHaveBeenCalledWith(expect.anything(), 'user-1', [perspectiveId]);
    await expect(response.json()).resolves.toMatchObject({ feedback: { verdict: 'helpful' } });
  });

  it('rejects malformed perspective ids before reading storage', async () => {
    const response = await GET(new Request('http://localhost/api/watchlist/perspective-feedback?perspectiveId=bad'));
    expect(response.status).toBe(400);
    expect(mocks.load).not.toHaveBeenCalled();
  });

  it('saves parsed feedback for the authenticated user', async () => {
    const response = await POST(new Request('http://localhost/api/watchlist/perspective-feedback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ perspectiveId, verdict: 'helpful' }),
    }));
    expect(response.status).toBe(200);
    expect(mocks.save).toHaveBeenCalledWith(expect.anything(), 'user-1', { perspectiveId, verdict: 'helpful' });
  });

  it('maps an inaccessible perspective to 404 without exposing ownership', async () => {
    mocks.save.mockRejectedValue(new Error('perspective_not_found'));
    const response = await POST(new Request('http://localhost/api/watchlist/perspective-feedback', {
      method: 'POST', body: JSON.stringify({ perspectiveId, verdict: 'helpful' }),
    }));
    expect(response.status).toBe(404);
  });

  it('deletes feedback using both user and perspective identity', async () => {
    const response = await DELETE(new Request(`http://localhost/api/watchlist/perspective-feedback?perspectiveId=${perspectiveId}`, { method: 'DELETE' }));
    expect(response.status).toBe(200);
    expect(mocks.remove).toHaveBeenCalledWith(expect.anything(), 'user-1', perspectiveId);
  });

  it('fails closed without a session for every mutation', async () => {
    mocks.auth.mockResolvedValue({ data: { user: null } });
    const response = await DELETE(new Request(`http://localhost/api/watchlist/perspective-feedback?perspectiveId=${perspectiveId}`, { method: 'DELETE' }));
    expect(response.status).toBe(401);
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});
