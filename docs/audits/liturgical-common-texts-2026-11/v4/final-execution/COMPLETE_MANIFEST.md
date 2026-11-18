# Finish only the manifest after verified data writes

Run 44139371468 wrote and readback-verified exactly 7,791 fields / 749 documents
in 30 bounded batches. The atomic manifest transaction correctly refused one
newer existing Proper value: 17-11-sv-elizabeth-hungary.vesperPs2. A single targeted
GET confirmed the same hash/updateTime as its transaction read. Preserve this
production field verbatim in the final Flutter target; no Proper write is made.

The amended authorization binds the full verified receipt and only allows
manifest completion with every original document/field receipt present and
verified. Missing/pending receipts, altered hashes/sizes/timestamps or different
plan/evidence bindings refuse before credentials. The existing writer's resume
skips all verified documents, performs zero target reads/writes and repeats only
the necessary final transaction metadata fence before publishing the three
indexes/current atomically. No publisher or general MASS permission is added.

30 writer/recovery tests passed, including the new manifest-only amendment guard.
The original 102 Flutter compatibility checks remain applicable. Source snapshot
projection retains both live baseline corrections; plan SHA is unchanged.

Actual publication is complete only after the final run's four manifest readbacks.
