# WING Tool Selection Guide

## Which tool to use when

### Reading state
| Goal | Tool |
|------|------|
| Discover consoles | wing_discover |
| Connect to console | wing_connect |
| Get connection status | wing_get_status |
| Search for parameter | wing_schema_search |
| Resolve "vocal" to target | wing_param_resolve |
| Read one parameter | wing_param_get |
| List all channels | wing_channel_list |
| Get full channel state | wing_channel_get |
| Read send level | wing_send_get |
| Trace signal path | wing_routing_trace |
| Read routing config | wing_routing_get |
| Read headamp/phantom | wing_headamp_get |
| List scenes | wing_scene_list |
| Read meters | wing_meter_read |
| Check signal presence | wing_signal_check |

### Making changes (prepare -> confirm -> apply)
| Goal | Prepare Tool | Apply Tool |
|------|-------------|-----------|
| Change fader | wing_channel_adjust_fader_prepare | wing_channel_adjust_fader_apply |
| Mute/unmute | wing_channel_set_mute_prepare | wing_channel_set_mute_apply |
| Adjust send | wing_send_adjust_prepare | wing_send_adjust_apply |
| Change routing | wing_routing_set_prepare | wing_routing_set_apply |
| Change headamp gain | wing_headamp_set_prepare | wing_headamp_set_apply |
| Toggle phantom | wing_phantom_set_prepare | wing_phantom_set_apply |
| Recall scene | wing_scene_recall_prepare | wing_scene_recall_apply |
| Generic param write | wing_param_set_prepare | wing_param_set_apply |

### Diagnosis (优先使用)
| Goal | Tool |
|------|------|
| Start diagnosis | sound_diagnosis_start |
| Next step | sound_diagnosis_next_step |
| Prepare fix | sound_diagnosis_prepare_fix |
| Apply fix | sound_diagnosis_apply_fix |

### Never use first unless developer_raw mode
- wing_raw_osc_prepare/apply
- wing_raw_native_prepare/apply
