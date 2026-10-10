use std::env;
use std::path::PathBuf;
use std::process::Command;

fn main() {
    #[cfg(target_os = "windows")]
    {
        println!("cargo:rustc-link-lib=crypt32");
        if let Ok(out_dir_str) = env::var("OUT_DIR") {
            let out_dir = PathBuf::from(out_dir_str);
            let manifest_path = out_dir.join("common_controls.manifest");
            let rc_path = out_dir.join("common_controls.rc");
            let obj_path = out_dir.join("common_controls.o");

            let manifest_content = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">
  <dependency>
    <dependentAssembly>
      <assemblyIdentity
        type="win32"
        name="Microsoft.Windows.Common-Controls"
        version="6.0.0.0"
        processorArchitecture="*"
        publicKeyToken="6595b64144ccf1df"
        language="*"
      />
    </dependentAssembly>
  </dependency>
</assembly>
"#;

            let rc_content = format!(r#"1 24 "{}""#, manifest_path.display().to_string().replace('\\', "/"));

            if std::fs::write(&manifest_path, manifest_content).is_ok()
                && std::fs::write(&rc_path, &rc_content).is_ok()
            {
                let status = Command::new("windres")
                    .arg(&rc_path)
                    .arg("-O")
                    .arg("coff")
                    .arg("-o")
                    .arg(&obj_path)
                    .status();

                if let Ok(s) = status {
                    if s.success() {
                        println!("cargo:rustc-link-arg={}", obj_path.display());
                    }
                }
            }
        }
    }

    tauri_build::build();
}
