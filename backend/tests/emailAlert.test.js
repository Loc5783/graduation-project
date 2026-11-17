import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/models/User.js', () => ({ default: { findById: vi.fn() } }));
vi.mock('../src/models/RegisteredDevice.js', () => ({ default: { findOne: vi.fn() } }));
vi.mock('../src/models/EmailAlert.js', () => ({ default: { create: vi.fn(), updateOne: vi.fn() } }));
vi.mock('../src/services/emailService.js', () => ({ isEmailConfigured: vi.fn(), sendEmail: vi.fn() }));

import User from '../src/models/User.js';
import RegisteredDevice from '../src/models/RegisteredDevice.js';
import EmailAlert from '../src/models/EmailAlert.js';
import { isEmailConfigured, sendEmail } from '../src/services/emailService.js';
import { deliverDeviceEmailAlert } from '../src/services/emailAlertService.js';

const params = { userId: 'user-1', eventCode: 'DEVICE_ALERT', eventParams: { deviceId: 'smart-door-lock', alertKind: 'FORCED_OPEN' }, dedupKey: 'event-1' };

describe('Device email alerts', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    isEmailConfigured.mockReturnValue(true);
    User.findById.mockReturnValue({ select: async () => ({ email: 'owner@example.com', emailVerificationRequired: true, emailVerifiedAt: new Date() }) });
    RegisteredDevice.findOne.mockReturnValue({ select: () => ({ lean: async () => ({ ownerUserId: 'user-1', viewerUserIds: [] }) }) });
    EmailAlert.create.mockResolvedValue({ _id: 'alert-1' });
    EmailAlert.updateOne.mockResolvedValue({ modifiedCount: 1 });
    sendEmail.mockResolvedValue(undefined);
  });

  it('sends to a verified owner and stores a deduplication record', async () => {
    expect(await deliverDeviceEmailAlert(params)).toBe(true);
    expect(EmailAlert.create).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-1', dedupKey: 'event-1' }));
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'owner@example.com' }));
  });

  it('does not send after access is revoked or before email verification', async () => {
    RegisteredDevice.findOne.mockReturnValue({ select: () => ({ lean: async () => ({ ownerUserId: 'other', viewerUserIds: [] }) }) });
    expect(await deliverDeviceEmailAlert(params)).toBe(false);
    expect(sendEmail).not.toHaveBeenCalled();
    RegisteredDevice.findOne.mockReturnValue({ select: () => ({ lean: async () => ({ ownerUserId: 'user-1', viewerUserIds: [] }) }) });
    User.findById.mockReturnValue({ select: async () => ({ email: 'owner@example.com', emailVerificationRequired: true, emailVerifiedAt: null }) });
    expect(await deliverDeviceEmailAlert(params)).toBe(false);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('does not send the same event twice, or pass SMTP failures to telemetry', async () => {
    EmailAlert.create.mockRejectedValueOnce({ code: 11000 });
    expect(await deliverDeviceEmailAlert(params)).toBe(false);
    expect(sendEmail).not.toHaveBeenCalled();
    sendEmail.mockRejectedValueOnce(Object.assign(new Error('SMTP unavailable'), { code: 'ECONNECTION' }));
    expect(await deliverDeviceEmailAlert(params)).toBe(false);
    expect(EmailAlert.updateOne).toHaveBeenCalledWith({ _id: 'alert-1' }, { $set: { status: 'failed' } });
  });
});
