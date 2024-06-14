extern crate itertools;

use super::utils::{
    test_get_all_devices, test_get_all_onwed_devices, test_get_default_device,
    test_get_drift_compensations, test_get_master_device, DeviceFilter, Scope,
};
use super::*;
use std::collections::HashSet;
use std::iter::zip;
use std::panic;

// AggregateDevice::set_sub_devices
// ------------------------------------
#[test]
#[should_panic]
fn test_aggregate_set_sub_devices_for_an_unknown_aggregate_device() {
    // If aggregate device id is kAudioObjectUnknown, we are unable to set device list.
    let default_input = test_get_default_device(Scope::Input);
    let default_output = test_get_default_device(Scope::Output);
    if default_input.is_none() || default_output.is_none() {
        panic!("No input or output device.");
    }

    let default_input = default_input.unwrap();
    let default_output = default_output.unwrap();
    assert!(
        run_serially_forward_panics(|| AggregateDevice::set_sub_devices(
            kAudioObjectUnknown,
            default_input,
            default_output
        ))
        .is_err()
    );
}

#[test]
#[should_panic]
fn test_aggregate_set_sub_devices_for_unknown_devices() {
    run_serially_forward_panics(|| {
        // If aggregate device id is kAudioObjectUnknown, we are unable to set device list.
        assert!(AggregateDevice::set_sub_devices(
            kAudioObjectUnknown,
            kAudioObjectUnknown,
            kAudioObjectUnknown
        )
        .is_err());
    });
}

// AggregateDevice::get_sub_devices
// ------------------------------------
#[test]
#[ignore]
fn test_aggregate_get_sub_devices() {
    fn diff(lhs: Vec<u32>, rhs: Vec<u32>) -> Vec<u32> {
        let left: HashSet<u32> = lhs.into_iter().collect();
        let right: HashSet<u32> = rhs.into_iter().collect();
        left.symmetric_difference(&right)
            .map(|&i| i.clone())
            .collect()
    }

    // Run in a large block so other test cases cannot add or remove devices while this runs.
    let input_device = test_get_default_device(Scope::Input);
    let output_device = test_get_default_device(Scope::Output);
    if input_device.is_none() || output_device.is_none() || input_device == output_device {
        println!("No input and output device to create an aggregate device.");
        return;
    }
    let devices_base = test_get_all_devices(DeviceFilter::ExcludeVPIO);
    run_serially_forward_panics(|| {
        assert!(
            devices_base
                .clone()
                .into_iter()
                .map(AggregateDevice::get_sub_devices)
                .any(|r| r.is_err()),
            "There should be some device that is not an aggregate."
        )
    });

    {
        // Test get_sub_devices on an empty aggregate device.
        let plugin_id = AggregateDevice::get_system_plugin_id().unwrap();
        let aggr = run_serially_forward_panics(|| AggregateDevice::create_blank_device(plugin_id))
            .unwrap();
        let new = diff(
            devices_base.clone(),
            test_get_all_devices(DeviceFilter::ExcludeVPIO),
        );
        assert_eq!(new.len(), 1);
        let new_subs = run_serially_forward_panics(|| AggregateDevice::get_sub_devices(new[0]));
        assert!(new_subs.is_ok());
        assert_eq!(new_subs.unwrap().len(), 0);
        assert!(
            run_serially_forward_panics(|| AggregateDevice::destroy_device(plugin_id, aggr))
                .is_ok()
        );
    }

    {
        // Test get_sub_devices on an aggregate device with two sub devices.
        let aggr = run_serially_forward_panics(|| {
            let input_device = input_device.unwrap();
            let output_device = output_device.unwrap();

            AggregateDevice::new(input_device, output_device)
        })
        .unwrap();
        let new = diff(
            devices_base.clone(),
            test_get_all_devices(DeviceFilter::ExcludeVPIO),
        );
        assert_eq!(new.len(), 1);
        let new_subs = run_serially_forward_panics(|| AggregateDevice::get_sub_devices(new[0]));
        assert!(new_subs.is_ok());
        assert_eq!(new_subs.unwrap().len(), 2);
        run_serially_forward_panics(|| drop(aggr));
    }
}

#[test]
#[should_panic]
fn test_aggregate_get_sub_devices_for_a_unknown_device() {
    run_serially_forward_panics(|| {
        AggregateDevice::get_sub_devices(kAudioObjectUnknown);
    });
}

// AggregateDevice::set_master_device
// ------------------------------------
#[test]
#[should_panic]
fn test_aggregate_set_master_device_for_an_unknown_aggregate_device() {
    run_serially_forward_panics(|| {
        assert!(
            AggregateDevice::set_master_device(kAudioObjectUnknown, kAudioObjectUnknown).is_err()
        );
    });
}

// AggregateDevice::activate_clock_drift_compensation
// ------------------------------------
#[test]
#[should_panic]
fn test_aggregate_activate_clock_drift_compensation_for_an_unknown_aggregate_device() {
    run_serially_forward_panics(|| {
        assert!(AggregateDevice::activate_clock_drift_compensation(kAudioObjectUnknown).is_err());
    });
}

// AggregateDevice::destroy_device
// ------------------------------------
#[test]
#[should_panic]
fn test_aggregate_destroy_device_for_unknown_plugin_and_aggregate_devices() {
    run_serially_forward_panics(|| {
        assert!(AggregateDevice::destroy_device(kAudioObjectUnknown, kAudioObjectUnknown).is_err())
    });
}

#[test]
#[should_panic]
fn test_aggregate_destroy_aggregate_device_for_a_unknown_aggregate_device() {
    run_serially_forward_panics(|| {
        let plugin = AggregateDevice::get_system_plugin_id().unwrap();
        assert!(AggregateDevice::destroy_device(plugin, kAudioObjectUnknown).is_err());
    });
}

// AggregateDevice::create_blank_device_sync
// ------------------------------------
#[test]
#[ignore]
fn test_aggregate_create_blank_device() {
    // TODO: Test this when there is no available devices.
    let plugin = AggregateDevice::get_system_plugin_id().unwrap();
    let device = AggregateDevice::create_blank_device_sync(plugin).unwrap();
    let devices = test_get_all_devices(DeviceFilter::IncludeAll);
    let device = devices.into_iter().find(|dev| dev == &device).unwrap();
    let uid = get_device_global_uid(device).unwrap().into_string();
    assert!(uid.contains(PRIVATE_AGGREGATE_DEVICE_NAME));
    assert!(AggregateDevice::destroy_device(plugin, device).is_ok());
}

// AggregateDevice::get_sub_devices
// ------------------------------------
#[test]
#[ignore]
#[should_panic]
fn test_aggregate_get_sub_devices_for_blank_aggregate_devices() {
    // TODO: Test this when there is no available devices.
    let plugin = AggregateDevice::get_system_plugin_id().unwrap();
    let device = AggregateDevice::create_blank_device_sync(plugin).unwrap();
    // There is no sub device in a blank aggregate device!
    // AggregateDevice::get_sub_devices guarantees returning a non-empty devices vector, so
    // the following call will panic!
    let sub_devices = AggregateDevice::get_sub_devices(device).unwrap();
    assert!(sub_devices.is_empty());
    assert!(AggregateDevice::destroy_device(plugin, device).is_ok());
}

// AggregateDevice::set_sub_devices_sync
// ------------------------------------
#[test]
#[ignore]
fn test_aggregate_set_sub_devices() {
    let input_device = test_get_default_device(Scope::Input);
    let output_device = test_get_default_device(Scope::Output);
    if input_device.is_none() || output_device.is_none() || input_device == output_device {
        println!("No input or output device to create an aggregate device.");
        return;
    }

    let input_device = input_device.unwrap();
    let output_device = output_device.unwrap();

    let plugin = AggregateDevice::get_system_plugin_id().unwrap();
    let device = AggregateDevice::create_blank_device_sync(plugin).unwrap();
    assert!(AggregateDevice::set_sub_devices_sync(device, input_device, output_device).is_ok());

    let sub_devices = AggregateDevice::get_sub_devices(device).unwrap();
    let input_sub_devices = AggregateDevice::get_sub_devices(input_device).unwrap();
    let output_sub_devices = AggregateDevice::get_sub_devices(output_device).unwrap();

    // TODO: There may be overlapping devices between input_sub_devices and output_sub_devices,
    //       but now AggregateDevice::set_sub_devices will add them directly.
    assert_eq!(
        sub_devices.len(),
        input_sub_devices.len() + output_sub_devices.len()
    );
    for dev in &input_sub_devices {
        assert!(sub_devices.contains(dev));
    }
    for dev in &output_sub_devices {
        assert!(sub_devices.contains(dev));
    }

    let onwed_devices = test_get_all_onwed_devices(device);
    let onwed_device_uids = get_device_uids(&onwed_devices);
    let input_sub_device_uids = get_device_uids(&input_sub_devices);
    let output_sub_device_uids = get_device_uids(&output_sub_devices);
    for uid in &input_sub_device_uids {
        assert!(onwed_device_uids.contains(uid));
    }
    for uid in &output_sub_device_uids {
        assert!(onwed_device_uids.contains(uid));
    }

    assert!(AggregateDevice::destroy_device(plugin, device).is_ok());
}

#[test]
#[ignore]
#[should_panic]
fn test_aggregate_set_sub_devices_for_unknown_input_devices() {
    let output_device = test_get_default_device(Scope::Output);
    if output_device.is_none() {
        panic!("Need a output device for the test!");
    }
    let output_device = output_device.unwrap();

    let plugin = AggregateDevice::get_system_plugin_id().unwrap();
    let device = AggregateDevice::create_blank_device_sync(plugin).unwrap();

    assert!(AggregateDevice::set_sub_devices(device, kAudioObjectUnknown, output_device).is_err());

    assert!(AggregateDevice::destroy_device(plugin, device).is_ok());
}

#[test]
#[ignore]
#[should_panic]
fn test_aggregate_set_sub_devices_for_unknown_output_devices() {
    let input_device = test_get_default_device(Scope::Input);
    if input_device.is_none() {
        panic!("Need a input device for the test!");
    }
    let input_device = input_device.unwrap();

    let plugin = AggregateDevice::get_system_plugin_id().unwrap();
    let device = AggregateDevice::create_blank_device_sync(plugin).unwrap();

    assert!(AggregateDevice::set_sub_devices(device, input_device, kAudioObjectUnknown).is_err());

    assert!(AggregateDevice::destroy_device(plugin, device).is_ok());
}

fn get_device_uids(devices: &Vec<AudioObjectID>) -> Vec<String> {
    devices
        .iter()
        .map(|device| get_device_global_uid(*device).unwrap().into_string())
        .collect()
}

// AggregateDevice::set_master_device
// ------------------------------------
#[test]
#[ignore]
fn test_aggregate_set_master_device() {
    let input_device = test_get_default_device(Scope::Input);
    let output_device = test_get_default_device(Scope::Output);
    if input_device.is_none() || output_device.is_none() || input_device == output_device {
        println!("No input or output device to create an aggregate device.");
        return;
    }

    let input_device = input_device.unwrap();
    let output_device = output_device.unwrap();

    let plugin = AggregateDevice::get_system_plugin_id().unwrap();
    let device = AggregateDevice::create_blank_device_sync(plugin).unwrap();
    assert!(AggregateDevice::set_sub_devices_sync(device, input_device, output_device).is_ok());
    assert!(AggregateDevice::set_master_device(device, output_device).is_ok());

    // Check if master is set to the first sub device of the default output device.
    let first_output_sub_device_uid =
        get_device_uid(AggregateDevice::get_sub_devices(device).unwrap()[0]);
    let master_device_uid = test_get_master_device(device);
    assert_eq!(first_output_sub_device_uid, master_device_uid);

    assert!(AggregateDevice::destroy_device(plugin, device).is_ok());
}

#[test]
#[ignore]
fn test_aggregate_set_master_device_for_a_blank_aggregate_device() {
    let output_device = test_get_default_device(Scope::Output);
    if output_device.is_none() {
        println!("No output device to test.");
        return;
    }

    let plugin = AggregateDevice::get_system_plugin_id().unwrap();
    let device = AggregateDevice::create_blank_device_sync(plugin).unwrap();
    assert!(AggregateDevice::set_master_device(device, output_device.unwrap()).is_ok());

    // TODO: it's really weird the aggregate device actually own nothing
    //       but its master device can be set successfully!
    // The sub devices of this blank aggregate device (by `AggregateDevice::get_sub_devices`)
    // and the own devices (by `test_get_all_onwed_devices`) is empty since the size returned
    // from `audio_object_get_property_data_size` is 0.
    // The CFStringRef of the master device returned from `test_get_master_device` is actually
    // non-null.

    assert!(AggregateDevice::destroy_device(plugin, device).is_ok());
}

fn get_device_uid(id: AudioObjectID) -> String {
    get_device_global_uid(id).unwrap().into_string()
}

// AggregateDevice::activate_clock_drift_compensation
// ------------------------------------
#[test]
#[ignore]
fn test_aggregate_activate_clock_drift_compensation() {
    let input_device = test_get_default_device(Scope::Input);
    let output_device = test_get_default_device(Scope::Output);
    if input_device.is_none() || output_device.is_none() || input_device == output_device {
        println!("No input or output device to create an aggregate device.");
        return;
    }

    let input_device = input_device.unwrap();
    let output_device = output_device.unwrap();

    let plugin = AggregateDevice::get_system_plugin_id().unwrap();
    let device = AggregateDevice::create_blank_device_sync(plugin).unwrap();
    assert!(AggregateDevice::set_sub_devices_sync(device, input_device, output_device).is_ok());
    assert!(AggregateDevice::set_master_device(device, output_device).is_ok());
    assert!(AggregateDevice::activate_clock_drift_compensation(device).is_ok());

    // Check the compensations.
    let devices = test_get_all_onwed_devices(device);
    let compensations = get_drift_compensations(&devices);
    assert!(!compensations.is_empty());
    assert_eq!(devices.len(), compensations.len());

    for (device, compensation) in zip(devices, compensations) {
        let uid = run_serially(|| get_device_uid(device));
        assert_eq!(
            compensation,
            if uid == master_device_uid {
                0
            } else {
                DRIFT_COMPENSATION
            }
        );
    }

    assert!(AggregateDevice::destroy_device(plugin, device).is_ok());
}

#[test]
#[ignore]
fn test_aggregate_activate_clock_drift_compensation_for_an_aggregate_device_without_master_device()
{
    let input_device = test_get_default_device(Scope::Input);
    let output_device = test_get_default_device(Scope::Output);
    if input_device.is_none() || output_device.is_none() || input_device == output_device {
        println!("No input or output device to create an aggregate device.");
        return;
    }

    let input_device = input_device.unwrap();
    let output_device = output_device.unwrap();

    let plugin = AggregateDevice::get_system_plugin_id().unwrap();
    let device = AggregateDevice::create_blank_device_sync(plugin).unwrap();
    assert!(AggregateDevice::set_sub_devices_sync(device, input_device, output_device).is_ok());

    // TODO: Is the master device the first output sub device by default if we
    //       don't set that ? Is it because we add the output sub device list
    //       before the input's one ? (See implementation of
    //       AggregateDevice::set_sub_devices).
    let first_output_sub_device_uid =
        get_device_uid(AggregateDevice::get_sub_devices(output_device).unwrap()[0]);
    let master_device_uid = test_get_master_device(device);
    assert_eq!(first_output_sub_device_uid, master_device_uid);

    // Compensate the drift directly without setting master device.
    assert!(AggregateDevice::activate_clock_drift_compensation(device).is_ok());

    // Check the compensations.
    let devices = test_get_all_onwed_devices(device);
    let compensations = get_drift_compensations(&devices);
    assert!(!compensations.is_empty());
    assert_eq!(devices.len(), compensations.len());

    for (i, compensation) in compensations.iter().enumerate() {
        assert_eq!(*compensation, if i == 0 { 0 } else { DRIFT_COMPENSATION });
    }

    assert!(AggregateDevice::destroy_device(plugin, device).is_ok());
}

#[test]
#[should_panic]
#[ignore]
fn test_aggregate_activate_clock_drift_compensation_for_a_blank_aggregate_device() {
    let plugin = AggregateDevice::get_system_plugin_id().unwrap();
    let device = AggregateDevice::create_blank_device_sync(plugin).unwrap();

    let sub_devices = AggregateDevice::get_sub_devices(device).unwrap();
    assert!(sub_devices.is_empty());
    let onwed_devices = test_get_all_onwed_devices(device);
    assert!(onwed_devices.is_empty());

    // Get a panic since no sub devices to be set compensation.
    assert!(AggregateDevice::activate_clock_drift_compensation(device).is_err());

    assert!(AggregateDevice::destroy_device(plugin, device).is_ok());
}

fn get_drift_compensations(devices: &Vec<AudioObjectID>) -> Vec<u32> {
    assert!(!devices.is_empty());
    let mut compensations = Vec::new();
    for device in devices {
        let compensation = test_get_drift_compensations(*device).unwrap();
        compensations.push(compensation);
    }

    compensations
}

// AggregateDevice::destroy_device
// ------------------------------------
#[test]
#[ignore]
#[should_panic]
fn test_aggregate_destroy_aggregate_device_for_a_unknown_plugin_device() {
    let plugin = AggregateDevice::get_system_plugin_id().unwrap();
    let device = AggregateDevice::create_blank_device_sync(plugin).unwrap();
    assert!(AggregateDevice::destroy_device(kAudioObjectUnknown, device).is_err());
}
