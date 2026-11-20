# CourtSync Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. **Anti-Double-Booking Slot Atomicity**: Every booked hour occupies a deterministic lock document at `/booking_slots/{courtId}_{date}_{hour}` whose parent `venueId`, `courtId`, and `bookingId` exist atomically (`existsAfter`). A slot cannot be overwritten once created.
2. **PII Isolation**: Customer phone numbers and booking details live strictly in `/bookings/{bookingId}` and are readable (`get` and `list`) ONLY by `resource.data.ownerUid == request.auth.uid` or a verified venue admin. Public availability reads use PII-free `/booking_slots/{slotId}`.
3. **Split Bill Integrity**: `/booking_participants/{participantId}` records can only be created atomically alongside a valid parent booking and updated only via explicit `affectedKeys().hasOnly(['paid', 'paidAt', 'paymentRef', 'updatedAt'])`.
4. **Open Play Quota Guard**: Joining `/open_plays/{sessionId}` increments `currentPlayers` by strictly `+1`, never exceeds `maxPlayers`, appends only `request.auth.uid`, and cannot modify `closed` rooms.
5. **Master Gate on Lobby Chat**: Writing messages to `/open_plays/{sessionId}/messages/{messageId}` requires the parent Open Play session to exist and the sender to be an active participant (`request.auth.uid in parent.data.participantUids`), with `senderUid == request.auth.uid`.
6. **Temporal & Immutable Integrity**: All `createdAt` and `updatedAt` timestamps must match `request.time`; `ownerUid` and `createdAt` are immutable after creation; `cancelled` bookings and `closed` open plays are terminal states.

## 2. The "Dirty Dozen" Adversarial Payloads (Must Return PERMISSION_DENIED)
1. **Identity Spoofing on Booking Create**: `POST /bookings/bk-1` with `ownerUid: "victim_uid"` while authenticated as `"attacker_uid"`.
2. **Shadow / Ghost Field Injection**: `POST /bookings/bk-2` including all required fields plus `"isAdminOverride": true`.
3. **ID Poisoning**: Creating `/bookings/` with a 200-char or symbol-injected ID like `../../admins/attacker`.
4. **PII Unauthorized Read**: `GET /bookings/bk-101` or `LIST /bookings` as an authenticated user who is neither `ownerUid` nor admin.
5. **Double-Booking Overwrite Attempt**: `UPDATE /booking_slots/cikutra-1_2026-11-19_18` attempting to hijack an already-locked slot.
6. **Orphaned Booking Create**: Creating `/bookings/bk-orphan` referencing non-existent `venueId: "fake-venue"` or `courtId: "fake-court"`.
7. **Timestamp Forgery**: Creating `/bookings/bk-time` with a client-forged `createdAt` timestamp instead of `request.time`.
8. **Terminal State Mutation**: Updating `/bookings/bk-cancelled` where `existing().status == "cancelled"` back to `"confirmed"`.
9. **Split Bill Amount Tampering**: Updating `/booking_participants/sp-1` modifying `amount` from `45000` to `1` alongside `paid: true`.
10. **Open Play Quota Overflow**: Updating `/open_plays/op-full` when `currentPlayers == maxPlayers` or incrementing `currentPlayers` by `+5`.
11. **Unverified Email Admin Spoof**: Attempting to update `/venues/gor-cikutra` with admin email claim while `email_verified == false`.
12. **Lobby Chat Outsider Injection**: Creating `/open_plays/op-1/messages/msg-x` as a user whose UID is NOT in `open_plays/op-1.participantUids`.
