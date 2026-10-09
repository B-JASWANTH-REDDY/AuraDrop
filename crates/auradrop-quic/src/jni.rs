//! JNI Bridge for Android (com.auradrop.auradrop.AuraQuicNative)

use crate::engine::{ApprovedTransfer, QuicEngine};
use crate::framing::TransferHeader;
use jni::objects::{JClass, JObject, JString};
use jni::sys::{jboolean, jint, jlong, jstring};
use jni::JNIEnv;
use once_cell::sync::Lazy;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::runtime::Runtime;
use tokio::sync::Mutex;

static RUNTIME: Lazy<Runtime> = Lazy::new(|| {
    tokio::runtime::Builder::new_multi_thread()
        .worker_threads(2)
        .enable_all()
        .build()
        .expect("Failed to initialize AuraDrop QUIC Tokio runtime for Android")
});

static GLOBAL_ENGINE: Lazy<Mutex<Option<QuicEngine>>> = Lazy::new(|| Mutex::new(None));
static GLOBAL_INCOMING_CALLBACK: Lazy<Mutex<Option<(Arc<jni::JavaVM>, Arc<jni::objects::GlobalRef>)>>> =
    Lazy::new(|| Mutex::new(None));

fn get_str(env: &mut JNIEnv, jstr: &JString) -> String {
    if jstr.is_null() {
        return String::new();
    }
    match env.get_string(jstr) {
        Ok(s) => s.into(),
        Err(_) => String::new(),
    }
}

/// Initializes the QUIC server on Android.
/// Returns JSON: `{"port": <port>, "certFingerprint": "<fingerprint>"}` or null on error.
#[no_mangle]
pub extern "system" fn Java_com_auradrop_auradrop_AuraQuicNative_initQuicServer(
    mut env: JNIEnv,
    _class: JClass,
    device_id: JString,
    port: jint,
) -> jstring {
    let device_id_str = get_str(&mut env, &device_id);
    let dev_id = if device_id_str.is_empty() {
        "android_device".to_string()
    } else {
        device_id_str
    };

    let bind_port = if port > 0 { port as u16 } else { 0 };
    let bind_addr: SocketAddr = format!("0.0.0.0:{}", bind_port).parse().unwrap();

    let result = RUNTIME.block_on(async {
        match QuicEngine::start(bind_addr, &dev_id).await {
            Ok(engine) => {
                let actual_port = engine.local_addr().map(|a| a.port()).unwrap_or(bind_port);
                let fp = engine.cert_fingerprint().to_string();
                let mut guard = GLOBAL_ENGINE.lock().await;
                *guard = Some(engine);
                let json = format!(r#"{{"port":{},"certFingerprint":"{}"}}"#, actual_port, fp);
                Some(json)
            }
            Err(e) => {
                tracing::error!("[AuraQuicJNI] Failed to start QUIC engine: {}", e);
                None
            }
        }
    });

    match result {
        Some(json_str) => env.new_string(json_str).unwrap().into_raw(),
        None => std::ptr::null_mut(),
    }
}

/// Registers an incoming transfer listener on Android.
#[no_mangle]
pub extern "system" fn Java_com_auradrop_auradrop_AuraQuicNative_setIncomingListener(
    env: JNIEnv,
    _class: JClass,
    callback: JObject,
) {
    let jvm = env.get_java_vm().ok().map(Arc::new);
    let cb_ref = env.new_global_ref(callback).ok().map(Arc::new);
    RUNTIME.block_on(async {
        let mut guard = GLOBAL_INCOMING_CALLBACK.lock().await;
        if let (Some(vm), Some(r)) = (jvm, cb_ref) {
            *guard = Some((vm, r));
        } else {
            *guard = None;
        }
    });
}

/// Registers an approved transfer token in the native engine.
#[no_mangle]
pub extern "system" fn Java_com_auradrop_auradrop_AuraQuicNative_approveTransfer(
    mut env: JNIEnv,
    _class: JClass,
    transfer_id: JString,
    token: JString,
    file_name: JString,
    file_size: jlong,
    expected_sha256: JString,
    destination_path: JString,
) -> jboolean {
    let xfer_id = get_str(&mut env, &transfer_id);
    let tok = get_str(&mut env, &token);
    let fname = get_str(&mut env, &file_name);
    let sha = get_str(&mut env, &expected_sha256);
    let dest = get_str(&mut env, &destination_path);

    let jvm_cb = RUNTIME.block_on(async {
        GLOBAL_INCOMING_CALLBACK.lock().await.clone()
    });

    let xfer_id_prog = xfer_id.clone();
    let fname_prog = fname.clone();
    let progress_cb: Option<crate::engine::ProgressCallback> = if let Some((ref jvm, ref cb_ref)) = jvm_cb {
        let jvm = jvm.clone();
        let cb_ref = cb_ref.clone();
        Some(Arc::new(move |transferred, total, speed| {
            if let Ok(mut env) = jvm.attach_current_thread() {
                if let (Ok(j_xid), Ok(j_fnm)) = (env.new_string(&xfer_id_prog), env.new_string(&fname_prog)) {
                    let res = env.call_method(
                        &**cb_ref,
                        "onIncomingProgress",
                        "(Ljava/lang/String;Ljava/lang/String;JJD)Z",
                        &[
                            (&j_xid).into(),
                            (&j_fnm).into(),
                            (transferred as jlong).into(),
                            (total as jlong).into(),
                            (speed as f64).into(),
                        ],
                    );
                    if let Ok(val) = res {
                        return val.z().unwrap_or(true);
                    }
                }
            }
            true
        }))
    } else {
        None
    };

    let xfer_id_comp = xfer_id.clone();
    let fname_comp = fname.clone();
    let total_sz = file_size as u64;
    let complete_cb: Option<crate::engine::CompletionCallback> = if let Some((ref jvm, ref cb_ref)) = jvm_cb {
        let jvm = jvm.clone();
        let cb_ref = cb_ref.clone();
        Some(Arc::new(move |_t_id, dest_path| {
            if let Ok(mut env) = jvm.attach_current_thread() {
                let p_str = dest_path.to_string_lossy().to_string();
                if let (Ok(j_xid), Ok(j_fnm), Ok(j_path)) = (
                    env.new_string(&xfer_id_comp),
                    env.new_string(&fname_comp),
                    env.new_string(&p_str),
                ) {
                    let _ = env.call_method(
                        &**cb_ref,
                        "onIncomingComplete",
                        "(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;J)V",
                        &[
                            (&j_xid).into(),
                            (&j_fnm).into(),
                            (&j_path).into(),
                            (total_sz as jlong).into(),
                        ],
                    );
                }
            }
        }))
    } else {
        None
    };

    let approved = ApprovedTransfer {
        transfer_id: xfer_id,
        token: tok,
        file_name: fname,
        file_size: file_size as u64,
        expected_sha256: sha,
        destination_path: PathBuf::from(dest),
        expires_at: Instant::now() + Duration::from_secs(65),
        on_progress: progress_cb,
        on_complete: complete_cb,
    };

    let ok = RUNTIME.block_on(async {
        let guard = GLOBAL_ENGINE.lock().await;
        if let Some(ref engine) = *guard {
            engine.approve_transfer(approved).await;
            true
        } else {
            false
        }
    });

    if ok { 1 } else { 0 }
}

/// Sends a file over QUIC from Android.
#[no_mangle]
pub extern "system" fn Java_com_auradrop_auradrop_AuraQuicNative_sendFileQuic(
    mut env: JNIEnv,
    _class: JClass,
    target_ip: JString,
    target_port: jint,
    cert_fingerprint: JString,
    file_path: JString,
    transfer_id: JString,
    token: JString,
    file_name: JString,
    file_size: jlong,
    expected_sha256: JString,
    callback: JObject,
) -> jboolean {
    let ip = get_str(&mut env, &target_ip);
    let fp = get_str(&mut env, &cert_fingerprint);
    let fpath = get_str(&mut env, &file_path);
    let xfer_id = get_str(&mut env, &transfer_id);
    let tok = get_str(&mut env, &token);
    let fname = get_str(&mut env, &file_name);
    let sha = get_str(&mut env, &expected_sha256);

    let target_addr: SocketAddr = match format!("{}:{}", ip, target_port).parse() {
        Ok(a) => a,
        Err(_) => return 0,
    };

    let header = TransferHeader {
        transfer_id: xfer_id,
        one_time_token: tok,
        file_name: fname,
        file_size: file_size as u64,
        expected_sha256: sha,
        sender_device_id: "android_client".to_string(),
        client_version: "2.0.1".to_string(),
    };

    let jvm = env.get_java_vm().ok();
    let callback_global = env.new_global_ref(callback).ok();

    let progress_cb: Option<Arc<dyn Fn(u64, u64, f64) -> bool + Send + Sync>> = if let (Some(jvm), Some(cb_ref)) = (jvm, callback_global) {
        Some(Arc::new(move |sent, total, speed| {
            if let Ok(mut env) = jvm.attach_current_thread() {
                let res = env.call_method(
                    &cb_ref,
                    "onProgress",
                    "(JJD)Z",
                    &[
                        (sent as jlong).into(),
                        (total as jlong).into(),
                        (speed as f64).into(),
                    ],
                );
                if let Ok(val) = res {
                    return val.z().unwrap_or(true);
                }
            }
            true
        }))
    } else {
        None
    };

    let success = RUNTIME.block_on(async {
        let guard = GLOBAL_ENGINE.lock().await;
        if let Some(ref engine) = *guard {
            match engine.send_file(
                target_addr,
                &fp,
                &PathBuf::from(fpath),
                header,
                progress_cb,
                None,
            ).await {
                Ok(_) => true,
                Err(e) => {
                    tracing::error!("[AuraQuicJNI] QUIC send_file error: {}", e);
                    false
                }
            }
        } else {
            false
        }
    });

    if success { 1 } else { 0 }
}

/// Cancels an active transfer.
#[no_mangle]
pub extern "system" fn Java_com_auradrop_auradrop_AuraQuicNative_cancelTransfer(
    mut env: JNIEnv,
    _class: JClass,
    transfer_id: JString,
) {
    let xfer_id = get_str(&mut env, &transfer_id);
    RUNTIME.block_on(async {
        let guard = GLOBAL_ENGINE.lock().await;
        if let Some(ref engine) = *guard {
            engine.cancel_transfer(&xfer_id).await;
        }
    });
}

/// Stops the QUIC engine and cleans up resources.
#[no_mangle]
pub extern "system" fn Java_com_auradrop_auradrop_AuraQuicNative_stopQuicServer(
    _env: JNIEnv,
    _class: JClass,
) {
    RUNTIME.block_on(async {
        let mut guard = GLOBAL_ENGINE.lock().await;
        if let Some(engine) = guard.take() {
            engine.shutdown().await;
        }
    });
}
