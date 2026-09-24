import test from 'node:test';
import assert from 'node:assert/strict';
import { isBatchAvailable, isBatchSourceApproved } from '../lib/trace-publish';

const publicChain = {
  isPublic: true,
  product: { isPublic: true, supplier: { verificationStatus: 'VERIFIED', status: 'ACTIVE' } },
};

test('local lots remain governed by the normal Sunfood publication chain', () => {
  assert.equal(isBatchAvailable({ ...publicChain, sourceSystem: 'LOCAL' }), true);
});

test('new HanoiCheck lots stay private until an accepted verified snapshot exists', () => {
  assert.equal(isBatchAvailable({ ...publicChain, sourceSystem: 'HANOICHECK', sourceReviewStatus: 'PENDING', sourceVerified: true }), false);
  assert.equal(isBatchAvailable({ ...publicChain, sourceSystem: 'HANOICHECK', sourceReviewStatus: 'NEEDS_REVIEW', sourceVerified: true }), false);
  assert.equal(isBatchAvailable({ ...publicChain, sourceSystem: 'HANOICHECK', sourceReviewStatus: 'APPROVED', sourceVerified: false }), false);
  assert.equal(isBatchAvailable({ ...publicChain, sourceSystem: 'HANOICHECK', sourceReviewStatus: 'APPROVED', sourceVerified: true }), true);
});

test('migrated public lots are grandfathered only when their immutable payload says verified', () => {
  assert.equal(isBatchSourceApproved({ sourceSystem: 'HANOICHECK', sourceReviewStatus: 'LEGACY', sourcePayload: '{"verified":true}' }), true);
  assert.equal(isBatchSourceApproved({ sourceSystem: 'HANOICHECK', sourceReviewStatus: 'LEGACY', sourcePayload: '{"verified":false}' }), false);
  assert.equal(isBatchSourceApproved({ sourceSystem: 'HANOICHECK', sourceReviewStatus: 'LEGACY', sourcePayload: 'invalid' }), false);
});

test('inactive or unverified supplier always closes the public lot', () => {
  assert.equal(isBatchAvailable({ ...publicChain, product: { isPublic: true, supplier: { verificationStatus: 'VERIFIED', status: 'INACTIVE' } } }), false);
  assert.equal(isBatchAvailable({ ...publicChain, product: { isPublic: true, supplier: { verificationStatus: 'DRAFT', status: 'ACTIVE' } } }), false);
});
