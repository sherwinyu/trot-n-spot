import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  AppState,
  BackHandler,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { DudleyRefresh } from '@/components/dudley/DudleyRefresh';
import { useIsFocused } from '@react-navigation/native';
import { ReceiptRuntimeProvider, useReceiptRuntime } from './RuntimeProvider';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import {
  dollars,
  type Product,
  type Receipt,
  type ReceiptDetail,
  type Stats,
  type Status,
} from '@bowl/shared';

import type { Picked } from './outbox';
import {
  Button,
  Card,
  Chip,
  ErrorBox,
  Field,
  Loading,
  StatusBadge,
  ReceiptMark,
  PlantMark,
  colors,
  s,
} from './ui';
import { Explore } from './Explore';
import { ReceiptView } from './ReceiptView';
import { ProductView } from './ProductView';
import { demoReceipt, demoStats } from './demo';

type Screen =
  | { type: 'explore' | 'receipts' | 'scan' | 'settings' }
  | { type: 'receipt'; id: string }
  | { type: 'product'; product: Product };
const emptyStats: Stats = {
  spend_cents: 0,
  visits: 0,
  average_basket_cents: 0,
  line_items: 0,
  produce_pounds: 0,
  review_included: 0,
  excluded_currency: 0,
  undated_receipts: 0,
  months: [],
  products: [],
};
function Main() {
  const focused = useIsFocused();
  const {
    api,
    connection,
    loadConnection,
    drain,
    enqueue,
    initOutbox,
    retryUploads,
    subscribe,
    snapshot,
    discardUpload,
  } = useReceiptRuntime();
  const [ready, setReady] = useState(false),
    [connected, setConnected] = useState(false),
    [demo, setDemo] = useState(false);
  const [screen, setScreen] = useState<Screen>({ type: 'explore' }),
    [history, setHistory] = useState<Screen[]>([]);
  const [stats, setStats] = useState<Stats>(emptyStats),
    [receipts, setReceipts] = useState<Receipt[]>([]),
    [receipt, setReceipt] = useState<ReceiptDetail>(),
    [counts, setCounts] = useState<Record<string, number>>({});
  const [period, setPeriod] = useState<'week' | 'month' | 'year'>('month'),
    [filter, setFilter] = useState<Status | undefined>(),
    [hasMore, setHasMore] = useState(false);
  const [busy, setBusy] = useState(false),
    [refreshing, setRefreshing] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [selected, setSelected] = useState<Picked[]>([]);
  const uploads = useSyncExternalStore(subscribe, snapshot, snapshot);
  const priorUploads = useRef(0);
  useEffect(() => {
    if (priorUploads.current > 0 && uploads.length === 0)
      setNotice(
        'All uploads finished. You can close the app; receipt reading continues on the server.',
      );
    priorUploads.current = uploads.length;
  }, [uploads.length]);
  const go = (next: Screen) => {
    setHistory((h) => [...h, screen]);
    setError('');
    setNotice('');
    setScreen(next);
  };
  const back = useCallback(() => {
    setHistory((h) => {
      const next = [...h];
      setScreen(next.pop() ?? { type: 'explore' });
      return next;
    });
    setError('');
  }, []);
  useEffect(() => {
    const b = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!focused || !history.length) return false;
      back();
      return true;
    });
    return () => b.remove();
  }, [history.length, back, focused]);
  useEffect(() => {
    Promise.all([loadConnection(), initOutbox()])
      .then(([c]) => {
        setConnected(!!c.url);
        void drain();
      })
      .catch((e) => setError(e.message))
      .finally(() => setReady(true));
  }, []);
  const refresh = useCallback(
    async (quiet = false) => {
      if (!connected && !demo) return;
      if (demo) {
        setStats(demoStats);
        setReceipts(filter && filter !== 'processed' ? [] : [demoReceipt]);
        setCounts({ processed: 1 });
        if (screen.type === 'receipt') setReceipt(demoReceipt);
        return;
      }
      if (!quiet) setRefreshing(true);
      try {
        if (screen.type === 'explore')
          setStats(await api<Stats>(`/stats?period=${period}`));
        if (screen.type === 'receipts' || screen.type === 'scan') {
          const r = await api<{
            receipts: Receipt[];
            has_more: boolean;
            counts: Record<string, number>;
          }>(`/receipts?limit=40${filter ? `&status=${filter}` : ''}`);
          setReceipts((prev) =>
            quiet
              ? [
                  ...r.receipts,
                  ...prev
                    .slice(40)
                    .filter((n) => !r.receipts.some((p) => p.id === n.id)),
                ]
              : r.receipts,
          );
          setCounts(r.counts);
          if (!quiet) setHasMore(r.has_more);
        }
        if (screen.type === 'receipt')
          setReceipt(await api<ReceiptDetail>(`/receipts/${screen.id}`));
        setError('');
      } catch (e) {
        if (!quiet) setError((e as Error).message);
      } finally {
        if (!quiet) setRefreshing(false);
      }
    },
    [connected, demo, screen, period, filter],
  );
  useEffect(() => {
    if (!focused) return;
    if (screen.type === 'receipt') setReceipt(undefined);
    void refresh();
    let interval: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      if (interval) clearInterval(interval);
      interval = setInterval(() => {
        void refresh(true);
        void drain();
      }, 4000);
    };
    start();
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void refresh(true);
        void drain();
        start();
      } else if (interval) clearInterval(interval);
    });
    return () => {
      if (interval) clearInterval(interval);
      listener.remove();
    };
  }, [refresh, focused]);
  const pick = async (kind: 'camera' | 'library' | 'files') => {
    setError('');
    if (demo) {
      setNotice('Connect your server to save real receipts.');
      return;
    }
    try {
      if (kind === 'files') {
        const r = await DocumentPicker.getDocumentAsync({
          type: 'image/*',
          multiple: true,
          copyToCacheDirectory: true,
        });
        if (!r.canceled) setSelected(r.assets);
        return;
      }
      if (kind === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted)
          throw new Error(
            'Camera access is off. Enable it in phone settings, or choose an existing receipt photo.',
          );
      }
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 1,
        exif: false,
        preferredAssetRepresentationMode:
          ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
      };
      const result =
        kind === 'camera'
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync({
              ...options,
              allowsMultipleSelection: true,
              selectionLimit: 0,
            });
      if (!result.canceled) setSelected(result.assets);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    if (Platform.OS === 'android')
      ImagePicker.getPendingResultAsync()
        .then((result) => {
          if (result && 'assets' in result && result.assets)
            setSelected(result.assets);
        })
        .catch(() => {});
  }, []);
  const savePhotos = async () => {
    setBusy(true);
    setError('');
    let saved = 0;
    try {
      await enqueue(selected, (n) => {
        saved = n;
        setNotice(`Saving ${n} of ${selected.length} on this device…`);
      });
      setSelected([]);
      setNotice(
        `${saved} receipt${saved === 1 ? '' : 's'} saved on this device. Uploading now; keep the app open until uploads finish.`,
      );
      setScreen({ type: 'receipts' });
      void drain().then(() => refresh(true));
    } catch (e) {
      setSelected((items) => items.slice(saved));
      setError(`${saved} saved. ${(e as Error).message}`);
      void drain();
    } finally {
      setBusy(false);
    }
  };
  const tab = (type: 'explore' | 'receipts' | 'scan') => {
    setHistory([]);
    setError('');
    setNotice('');
    setScreen({ type });
  };
  const loadMore = async () => {
    setBusy(true);
    try {
      const r = await api<{ receipts: Receipt[]; has_more: boolean }>(
        `/receipts?limit=40&offset=${receipts.length}${filter ? `&status=${filter}` : ''}`,
      );
      setReceipts((prev) => [
        ...prev,
        ...r.receipts.filter((n) => !prev.some((p) => p.id === n.id)),
      ]);
      setHasMore(r.has_more);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!ready) return <Loading />;
  const setup = (!connected && !demo) || screen.type === 'settings';
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View
        style={{ width: '100%', maxWidth: 660, alignSelf: 'center', flex: 1 }}
      >
        <View
          style={[
            s.between,
            {
              paddingHorizontal: 22,
              paddingVertical: 14,
              borderBottomColor: colors.line,
              borderBottomWidth: 1,
            },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              history.length ? 'Go back' : 'Grocery journal home'
            }
            onPress={history.length ? back : () => tab('explore')}
          >
            <Text
              style={{ fontSize: 17, fontWeight: '700', color: colors.ink }}
            >
              {history.length ? '‹ Back' : 'Grocery journal'}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Connection settings"
            onPress={() => go({ type: 'settings' })}
          >
            <Text style={s.link}>Connection</Text>
          </Pressable>
        </View>
        {demo ? (
          <View style={{ backgroundColor: colors.lime, padding: 9 }}>
            <Text
              style={{ color: colors.green, textAlign: 'center', fontSize: 12 }}
            >
              DEMO · Synthetic data ·{' '}
              <Text
                onPress={() => {
                  setDemo(false);
                  setScreen({ type: 'settings' });
                }}
              >
                Connect your server →
              </Text>
            </Text>
          </View>
        ) : null}
        {!setup ? (
          <View
            style={{
              flexDirection: 'row',
              gap: 8,
              paddingHorizontal: 22,
              paddingVertical: 12,
            }}
          >
            {(
              [
                ['explore', 'Explore'],
                ['scan', 'Scan'],
                ['receipts', 'Receipts'],
              ] as const
            ).map(([type, label]) => (
              <Chip
                key={type}
                label={label}
                selected={screen.type === type}
                onPress={() => tab(type)}
              />
            ))}
          </View>
        ) : null}
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <DudleyRefresh
            onRefresh={() => refresh()}
            disabled={refreshing}
            hidden={setup}
            // Editing/capture screens keep the button, without stealing field gestures.
            gesturesEnabled={screen.type === 'explore' || screen.type === 'receipts'}
          >
            {scrollProps => <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={s.page}
            {...scrollProps}
          >
            {error ? <ErrorBox message={error} /> : null}
            {notice ? (
              <Card style={{ backgroundColor: colors.lime }}>
                <Text style={s.body}>{notice}</Text>
              </Card>
            ) : null}
            {setup ? (
              <Setup
                onSaved={() => {
                  setConnected(true);
                  setDemo(false);
                  setScreen({ type: 'explore' });
                  setHistory([]);
                  void drain();
                }}
                onDemo={() => {
                  setDemo(true);
                  setScreen({ type: 'explore' });
                  setHistory([]);
                }}
              />
            ) : (
              <>
                {screen.type === 'explore' ? (
                  <Explore
                    stats={stats}
                    period={period}
                    setPeriod={setPeriod}
                    onProduct={(p) => go({ type: 'product', product: p })}
                    onScan={() => tab('scan')}
                  />
                ) : null}
                {screen.type === 'scan' ? (
                  <>
                    <View>
                      <Text style={s.eyebrow}>Photo → done</Text>
                      <Text style={[s.title, { marginTop: 8 }]}>
                        {'Save the receipt.\nKeep the story.'}
                      </Text>
                      <Text style={[s.muted, { marginTop: 10 }]}>
                        One photo, the whole receipt. We'll take care of the
                        details after upload.
                      </Text>
                    </View>
                    {!selected.length ? (
                      <Card
                        style={{
                          padding: 30,
                          alignItems: 'center',
                          borderStyle: 'dashed',
                          backgroundColor: '#EFF1E4',
                        }}
                      >
                        <ReceiptMark />
                        <Text style={s.heading}>
                          A little piece of your day.
                        </Text>
                        <Text style={[s.muted, { textAlign: 'center' }]}>
                          Keep the full receipt in frame, with clear text and a
                          little light.
                        </Text>
                      </Card>
                    ) : (
                      <Card>
                        <Text style={s.heading}>
                          {selected.length} photo
                          {selected.length === 1 ? '' : 's'} ready
                        </Text>
                        <ScrollView horizontal>
                          <View style={s.row}>
                            {selected.map((asset, i) => (
                              <View key={asset.uri + i} style={{ gap: 8 }}>
                                <Image
                                  source={{ uri: asset.uri }}
                                  style={{
                                    height: 220,
                                    width: 130,
                                    borderRadius: 12,
                                  }}
                                  resizeMode="cover"
                                />
                                <Chip
                                  label="Remove"
                                  onPress={() =>
                                    setSelected((a) =>
                                      a.filter((_, j) => j !== i),
                                    )
                                  }
                                />
                              </View>
                            ))}
                          </View>
                        </ScrollView>
                        <Button
                          label={
                            busy
                              ? 'Saving photos…'
                              : `Save ${selected.length === 1 ? 'receipt' : selected.length + ' receipts'}`
                          }
                          disabled={busy}
                          onPress={() => void savePhotos()}
                        />
                        <Button
                          secondary
                          label="Choose again"
                          disabled={busy}
                          onPress={() => setSelected([])}
                        />
                      </Card>
                    )}
                    <Button
                      label="Take a receipt photo"
                      disabled={busy}
                      onPress={() => void pick('camera')}
                    />
                    <Button
                      label="Import from photo library"
                      secondary
                      disabled={busy}
                      onPress={() => void pick('library')}
                    />
                    <Button
                      label="Import image files"
                      secondary
                      disabled={busy}
                      onPress={() => void pick('files')}
                    />
                    <Text style={s.muted}>
                      Have a stack of old receipts? Select them all. Each photo
                      is saved and processed separately.
                    </Text>
                  </>
                ) : null}
                {screen.type === 'receipts' ? (
                  <>
                    <View style={s.between}>
                      <View>
                        <Text style={s.eyebrow}>
                          Small trips, a growing history
                        </Text>
                        <Text style={[s.title, { marginTop: 8 }]}>
                          Your receipts.
                        </Text>
                      </View>
                      <Chip
                        label="+ Add"
                        selected
                        onPress={() => tab('scan')}
                      />
                    </View>
                    <Card>
                      <Text style={s.heading}>
                        {(counts.processed ?? 0) + (counts.needs_review ?? 0)}{' '}
                        read ·{' '}
                        {(counts.pending ?? 0) + (counts.processing ?? 0)}{' '}
                        processing
                      </Text>
                      <Text style={s.muted}>
                        {counts.needs_review ?? 0} to check ·{' '}
                        {counts.failed ?? 0} failed. After upload, reading
                        continues even when you close the app.
                      </Text>
                    </Card>
                    {uploads.length ? (
                      <Card>
                        <Text style={s.heading}>
                          On this device · {uploads.length}
                        </Text>
                        <Text style={s.muted}>
                          Keep the app open until uploads finish. Interrupted
                          uploads resume when you reopen it.
                        </Text>
                        {uploads.map((u) => (
                          <View key={u.id} style={{ gap: 6 }}>
                            <Text style={s.body}>
                              {u.name} · {u.status}
                            </Text>
                            {u.error ? (
                              <Text style={{ color: colors.red, fontSize: 12 }}>
                                {u.error}
                              </Text>
                            ) : null}
                            {u.status === 'failed' ? (
                              <Chip
                                label="Remove from upload queue"
                                onPress={() =>
                                  void discardUpload(u.id).catch((e) =>
                                    setError(e.message),
                                  )
                                }
                              />
                            ) : null}
                          </View>
                        ))}
                        <Button
                          label="Retry failed uploads"
                          secondary
                          onPress={() =>
                            void retryUploads()
                              .then(() => refresh(true))
                              .catch((e) => setError(e.message))
                          }
                        />
                      </Card>
                    ) : null}
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                    >
                      <View style={s.row}>
                        {(
                          [
                            [undefined, 'All'],
                            ['needs_review', 'Check totals'],
                            ['failed', 'Failed'],
                            ['pending', 'Queued'],
                            ['processing', 'Reading'],
                            ['processed', 'Ready'],
                          ] as const
                        ).map(([v, label]) => (
                          <Chip
                            key={label}
                            label={label}
                            selected={filter === v}
                            onPress={() => setFilter(v)}
                          />
                        ))}
                      </View>
                    </ScrollView>
                    {receipts.map((r) => (
                      <Pressable
                        accessibilityRole="button"
                        key={r.id}
                        onPress={() => go({ type: 'receipt', id: r.id })}
                      >
                        <Card>
                          <View style={s.between}>
                            <Text
                              style={[s.body, { fontWeight: '600', flex: 1 }]}
                            >
                              {r.merchant ?? 'New receipt'}
                            </Text>
                            <Text style={s.heading}>
                              {dollars(r.total_cents, r.currency ?? 'USD')}
                            </Text>
                          </View>
                          <View style={s.between}>
                            <Text style={s.muted}>
                              {r.purchased_at ?? 'Date pending'} ·{' '}
                              {r.item_count} items
                            </Text>
                            <StatusBadge status={r.status} />
                          </View>
                        </Card>
                      </Pressable>
                    ))}
                    {!receipts.length ? (
                      <Card>
                        <Text style={s.heading}>
                          {filter
                            ? 'Nothing here.'
                            : 'Every basket has a story.'}
                        </Text>
                        <Text style={s.muted}>
                          {filter
                            ? 'No receipts match this filter.'
                            : 'Start by taking a photo or importing your old receipts.'}
                        </Text>
                      </Card>
                    ) : null}
                    {hasMore ? (
                      <Button
                        label="Load more receipts"
                        secondary
                        disabled={busy}
                        onPress={() => void loadMore()}
                      />
                    ) : null}
                  </>
                ) : null}
                {screen.type === 'receipt' ? (
                  (receipt && receipt.id === screen.id) || (demo && receipt) ? (
                    <ReceiptView
                      key={receipt!.id}
                      receipt={receipt!}
                      demo={demo}
                      onChange={() => void refresh()}
                    />
                  ) : (
                    <Loading />
                  )
                ) : null}
                {screen.type === 'product' ? (
                  <ProductView
                    product={screen.product}
                    demo={demo}
                    onReceipt={(id) => go({ type: 'receipt', id })}
                  />
                ) : null}
              </>
            )}
          </ScrollView>}
          </DudleyRefresh>
        </KeyboardAvoidingView>
      </View>
    </View>
  );
}
function Setup({
  onSaved,
  onDemo,
}: {
  onSaved: () => void;
  onDemo: () => void;
}) {
  const { api, connection, saveConnection } = useReceiptRuntime();
  const [url, setURL] = useState(connection().url),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    setError('');
    try {
      await saveConnection({ url });
      await api('/receipts?limit=1');
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <View style={{ paddingVertical: 25, gap: 14 }}>
        <PlantMark />
        <Text style={s.eyebrow}>Your grocery journal</Text>
        <Text style={s.title}>
          {'Good groceries.\nA little more curiosity.'}
        </Text>
        <Text style={s.body}>
          Turn receipt photos into the story of what you buy, what it costs, and
          what keeps finding its way into your basket.
        </Text>
      </View>
      <Card>
        <Text style={s.heading}>Connect your grocery journal</Text>
        <Field
          label="Server address"
          value={url}
          onChangeText={setURL}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="https://your-server.example"
        />
        {error ? <ErrorBox message={error} /> : null}
        <Button
          label={busy ? 'Connecting…' : 'Connect'}
          disabled={busy}
          onPress={() => void save()}
        />
        <Text style={s.muted}>
          Your Trot n Spot sign-in keeps your receipts private. No extra account
          or access token is needed.
        </Text>
      </Card>
      <Button label="Explore with sample data" secondary onPress={onDemo} />
      <Text style={s.muted}>
        A personal grocery journal. No budgets, goals, or guilt.
      </Text>
    </>
  );
}
export default function GroceriesScreen({ userId }: { userId: string }) {
  return (
    <ReceiptRuntimeProvider userId={userId}>
      <Main />
    </ReceiptRuntimeProvider>
  );
}
