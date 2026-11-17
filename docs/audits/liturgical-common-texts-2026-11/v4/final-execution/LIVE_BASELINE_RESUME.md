# Preserve the real baseline and resume the completed preflight

Production run 44136754414 (main 9606f241) read 749 target documents + 4 manifest
records and stopped before any write. Only days/office-for-dead differs outside
the exact 7,791 masks: production checked=false and allowedAlleluia=true are
absent from the candidate, and production vesperPs3 contains its current HTML.
The final bundle preserves all three production values verbatim. No editorial
normalization or Firestore write is authorized for these fields.

`live-baseline-preservation.json` is a separately pinned Flutter-only target
amendment. Original PR113 and 344-field supplement stay immutable. Revised days
digest is b80a2589e5651bd7; the exact 7,791-field plan SHA is unchanged. All 749
projected documents match the revised target from the already captured data.

Resume binds the original zero-write receipt SHA and a canonical map of every
checkpoint file's SHA. A modified/missing file, a different plan, any attempted or
acknowledged write, or any other blocked state refuses checkpoint reuse before
credentials. The original captured server updateTimes remain exact write CAS
preconditions; a concurrent edit rejects its whole batch. All successful batches
still read back from Firestore, and the final transaction fences every collection
ID/updateTime before atomic indexes/current publication. No new full preflight
scan is performed. Generic MASS, legacy release and normal resume gates stay intact.

29 writer/recovery tests and the single affected exact-target Flutter data
preservation test pass. Prior 101 source/updater tests are retained; total 102.
No mobile release or native/installed-binary claim is made. This document records
the preparation, not a completed production publication.
