# 12. Testing and Hardware Validation

## 1. Test pyramid

```text
unit tests
  - risk engine
  - path resolver
  - unit converters
  - confirmation parser

fake-wing integration tests
  - discovery
  - get/set/readback
  - meter streams
  - disconnects

hardware-gated tests
  - real WING read-only
  - real low-risk writes
  - meter validation

field tests
  - empty room
  - low-volume PA
  - rehearsal
  - live read-only
```

## 2. fake-wing requirements

Fake WING must support：

- UDP 2222 discovery。
- UDP 2223 OSC-like commands。
- TCP/stdio native mock。
- mutable parameter tree。
- meter stream。
- fault injection。

Fault injection：

```text
- timeout
- packet loss
- stale schema
- readback mismatch
- disconnect after prepare
- meter stream stops
- parameter read-only
- value out of range
- race: old value changes before apply
```

## 3. Scenario tests

No-sound scenario library：

```text
01 microphone unplugged
02 XLR cable failed
03 mic switch off
04 condenser mic without phantom
05 ribbon mic phantom safety warning
06 source patch wrong
07 headamp gain too low
08 gate threshold too high
09 channel muted
10 channel fader -inf
11 DCA fader down
12 DCA muted
13 mute group active
14 main send off
15 bus send off
16 bus master muted
17 main LR muted
18 matrix muted
19 output patch wrong
20 Dante route wrong
21 AES50/stagebox offline
22 USB playback route wrong
23 speaker processor muted
24 powered speaker off
25 amp rack off
26 IEM pack off
27 wedge cable unplugged
28 recorder input wrong
29 livestream bus wrong
30 virtual soundcheck route not restored
```

## 4. Hardware test gating

All real WING tests require env var：

```bash
WING_HARDWARE_TEST=1 WING_IP=192.168.1.62 pnpm test:hardware
```

Tests must default to read-only unless explicit：

```bash
WING_HARDWARE_WRITE_TEST=1
```

## 5. Safety acceptance tests

Must pass：

- `wing_raw_osc_apply` denied in live mode。
- `wing_phantom_set_apply` denied without exact confirmation。
- `wing_scene_recall_apply` denied without exact confirmation。
- `wing_main_set_apply` denied if delta > cap。
- expired confirmation_id denied。
- confirmation_id for target A cannot apply target B。
- readback mismatch returns failed and logs audit。
- state change between prepare and apply triggers re-prepare。

## 6. Field validation checklist

Before connecting to PA：

```text
[ ] WING backup created
[ ] output volume physically safe
[ ] AI in read-only mode
[ ] TTS not routed to PA
[ ] raw tools disabled
[ ] audit log writable
[ ] network stable
[ ] emergency stop documented
```

During low-volume tests：

```text
[ ] channel fader +1 dB works and readback matches
[ ] channel mute requires confirmation
[ ] meter read matches console display qualitatively
[ ] disconnect recovery safe
[ ] failed write does not retry indefinitely
```
