/** Initial recommendation rules (product spec §2). Anything not listed is manual. */
const fixed = (id, month, day, offsetDays = -9) => [id, { type: 'fixedFeast', month, day, offsetDays }];
const moving = (id, event, offsetDays = -9) => [id, { type: 'liturgical', event, offsetDays }];
export const INITIAL_SCHEDULES = Object.fromEntries([
  fixed('edc7LXLBYXd8qxqOaqrZ', 12, 8), fixed('JcqOxKZRhOW3z4w0WPo5', 12, 25), fixed('cn_69bb76a34a2c4929', 1, 24),
  fixed('cn_98e6cdf23d32cb44', 1, 31), fixed('LIlRAW1cIzp1oUS72AUX', 2, 11), fixed('a8tYTDVjR2Ni75PjzOyz', 3, 4),
  fixed('cn_05b28c5bea797880', 3, 19), fixed('oP3C3W6wnw5Iga5d6aln', 4, 28), fixed('cn_fbfef847fbdbe13f', 4, 29),
  fixed('cn_c3f7320a05c0e7c7', 5, 16), fixed('cn_5f691ff4d2b8511d', 5, 22), fixed('cn_a0566f9bdb3d13c8', 6, 13),
  fixed('cn_fc5826141ac1af08', 6, 24), fixed('cn_b7af65f7d87c2217', 6, 27), fixed('cn_f0a94029ab7123e2', 6, 29),
  fixed('cn_38e44fcd858f9423', 7, 2), fixed('cn_54099c135fe5cfc6', 7, 11), fixed('cn_9231d3302b5b2795', 7, 16),
  fixed('cn_4c8fd3185087ca48', 7, 26), fixed('cn_948820d9dd158b9d', 8, 16), fixed('cn_6c007cd266e56da8', 9, 23),
  fixed('cn_ef21171d9c54b47a', 9, 29), fixed('cn_13206277cdb44124', 10, 1), fixed('cn_ba797c06891dada0', 10, 4),
  fixed('cn_38edd320c0878a03', 10, 22), fixed('XMJCWmBqkteNID7PxGeC', 10, 28),
  fixed('import-10-navenna-za-pamerlykh-z-bl-a-hanaratam', 11, 2), fixed('cn_5e9627f21e9728ee', 11, 2),
  fixed('cn_f3d514d8962a23bb', 11, 16), fixed('cn_20424a9d8b687461', 12, 4),
  moving('catholicby-yearcycle-100111', 'good-friday', 0), moving('Iiufha8NyLABTw92rA5S', 'pentecost'),
  moving('cn_f875a48f69204c9b', 'trinity'), moving('cn_3b9c7bc54d8108f8', 'corpus-christi'),
  moving('DVCz2NZEvgNdVFmQJaJB', 'sacred-heart'), moving('cn_ef983a62c664ccaa', 'immaculate-heart'),
  moving('cn_d3e3bc0e7d1b276c', 'christ-king'), moving('cn_609ae58774e83552', 'holy-family'),
]);
export const scheduleFor = (id) => ({ enabled: true, extraDates: [], ...(INITIAL_SCHEDULES[id] || { type: 'manual' }) });
