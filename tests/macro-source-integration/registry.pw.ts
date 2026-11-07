import {expect, test} from '@playwright/test';

test('server fixture registration cannot satisfy a different HTTP method', async ({request}) => {
  const path = '/api/macro/verification/get-only';
  const registration = await request.post('/__fixture/register', {data: {url: path, json: {fixture: 'GET only'}}});
  expect(registration.status()).toBe(201);
  expect((await registration.json()).registered).toBe(`GET ${path}`);
  const get = await request.get(path);
  expect(get.status()).toBe(200);
  expect(await get.json()).toEqual({fixture: 'GET only'});
  const post = await request.post(path);
  expect(post.status()).toBe(503);
  expect(await post.json()).toEqual({error: {code: 'fixture_response_not_registered'}, fixtureOnly: true});
});

test('server fixture registry keeps GET and POST responses at one URL separate', async ({request}) => {
  const path = '/api/macro/verification/two-methods?lineage=captured';
  for (const method of ['GET', 'POST']) {
    const registration = await request.post('/__fixture/register', {data: {url: path, method, json: {method}}});
    expect(registration.status()).toBe(201);
  }
  expect(await (await request.get(path)).json()).toEqual({method: 'GET'});
  expect(await (await request.post(path)).json()).toEqual({method: 'POST'});
  const otherQuery = await request.get(path.replace('captured', 'newest'));
  expect(otherQuery.status()).toBe(503);
  expect((await otherQuery.json()).error.code).toBe('fixture_response_not_registered');
});
