// Exact planned hashes, real Hive storage, fake manifest-only remote; no Firebase.
import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive/hive.dart';
import 'package:mybrev_flutter/content/content_bundle.dart';
import 'package:mybrev_flutter/content/content_store.dart';
import 'package:mybrev_flutter/content/content_updater.dart';
import 'package:mybrev_flutter/providers/connectivity_provider.dart';
import 'package:mybrev_flutter/providers/content_updates_provider.dart';
import 'package:mybrev_flutter/services/hive_service.dart';
import 'content_offline_test.dart' show bundled;

class _TargetRemote implements ContentRemote {
  final target =
      jsonDecode(
            File(
              'test/fixtures/pr255_reconciled_target.json',
            ).readAsStringSync(),
          )
          as Map;
  int downloads = 0;
  @override
  Future<Map<String, dynamic>?> fetchCurrent() async => {
    'schemaVersion': 1,
    'contentVersion': 1795000000000,
    'collections': {
      for (final name in target.keys) name: {'digest': target[name]['digest']},
    },
  };
  @override
  Future<Map<String, dynamic>?> fetchCollectionManifest(String name) async =>
      Map<String, dynamic>.from(target[name] as Map);
  @override
  Future<Map<String, Map<String, dynamic>>> fetchDocuments(
    String collection,
    List<String> ids,
  ) async {
    downloads += ids.length;
    throw StateError('A rebuild must never download documents');
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test(
    'exact PR255 target preserves settings, favorites, personal prayers and local content across appReleaseRequired and restart',
    () async {
      final directory = await Directory.systemTemp.createTemp(
        'pr255-test-client-',
      );
      ProviderContainer? container;
      try {
        await HiveService.init(path: directory.path, loadBundle: true);
        final store = ContentStore.instance;
        await store.ensureLoaded(kContentCollections);
        await store.idle();
        final old =
            jsonDecode(
                  File(
                    'test/fixtures/pr255_previous_hashes.json',
                  ).readAsStringSync(),
                )
                as Map;
        for (final name in [
          'days',
          'liturgicalTemplates',
          'liturgicalProperTexts',
        ]) {
          await store
              .collection(name)
              .debugReplaceBaseline(
                bundled(name),
                (old[name] as Map).cast<String, String>(),
                1794092262000,
              );
        }
        const settings = {
          'fontSize': 22,
          'theme': 'dark',
          'favoriteIds': '["p1"]',
          'highlights:r1': {'s1': 'yellow'},
        };
        const personal = {
          'id': 'mine',
          'title': 'Мая малітва',
          'text': 'Асабісты тэкст',
          'custom': true,
        };
        await HiveService.settingsBox.putAll(settings);
        await HiveService.localPrayersBox.put('mine', personal);
        final before = {
          for (final n in kContentCollections) n: store.collection(n).digest(),
        };
        final remote = _TargetRemote();
        ProviderContainer open() => ProviderContainer(
          overrides: [
            contentUpdaterProvider.overrideWithValue(
              ContentUpdater(remote: remote),
            ),
            isOfflineProvider.overrideWithValue(false),
            connectivityProvider.overrideWith((ref) => Stream.value(true)),
          ],
        );
        container = open();
        await container.read(contentUpdatesProvider.notifier).check();
        expect(
          container.read(contentUpdatesProvider).appReleaseReason,
          AppReleaseReason.rebuild,
        );
        expect(container.read(contentUpdatesProvider).failed, isFalse);
        expect(remote.downloads, 0);
        expect({
          for (final n in kContentCollections) n: store.collection(n).digest(),
        }, before);
        for (final entry in settings.entries)
          expect(HiveService.settingsBox.get(entry.key), entry.value);
        expect(HiveService.localPrayersBox.get('mine'), personal);
        container.dispose();
        container = null;
        await store.idle();
        await Hive.close();
        await HiveService.init(path: directory.path, loadBundle: true);
        await store.ensureLoaded(kContentCollections);
        await store.idle();
        container = open();
        expect(
          container.read(contentUpdatesProvider).appReleaseReason,
          AppReleaseReason.rebuild,
        );
        for (final entry in settings.entries)
          expect(HiveService.settingsBox.get(entry.key), entry.value);
        expect(HiveService.localPrayersBox.get('mine'), personal);
        expect(remote.downloads, 0);
      } finally {
        container?.dispose();
        await ContentStore.instance.idle();
        await Hive.close();
        await directory.delete(recursive: true);
      }
    },
  );
}
