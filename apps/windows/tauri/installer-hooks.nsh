; Pane NSIS installer hooks.
;
; Register/unregister the sparse identity package so pane.exe runs with Windows
; package identity (required to control Dynamic Lighting in the background and
; to appear under Settings -> Personalization -> Dynamic Lighting -> Background
; light control). The actual work lives in the bundled register-identity.ps1 /
; unregister-identity.ps1 so the cert-trust + Add-AppxPackage logic isn't
; trapped in NSIS string-escaping. We locate those scripts recursively under
; $INSTDIR to stay independent of exactly where Tauri lays out resources.
;
; Trusting the self-signed cert writes to LocalMachine\TrustedPeople and
; LocalMachine\Root, which is why bundle.windows.nsis.installMode must be
; "perMachine" (admin). Both hooks swallow errors: Dynamic Lighting is optional
; and must not block install or uninstall.

!macro NSIS_HOOK_POSTINSTALL
  DetailPrint "Registering Pane Dynamic Lighting identity package..."
  nsExec::ExecToLog 'powershell -NoProfile -ExecutionPolicy Bypass -Command "& { $$s = Get-ChildItem -LiteralPath $\'$INSTDIR$\' -Recurse -Filter register-identity.ps1 -ErrorAction SilentlyContinue | Select-Object -First 1; if ($$s) { & $$s.FullName -InstallDir $\'$INSTDIR$\' } }"'
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  DetailPrint "Removing Pane Dynamic Lighting identity package..."
  nsExec::ExecToLog 'powershell -NoProfile -ExecutionPolicy Bypass -Command "& { $$s = Get-ChildItem -LiteralPath $\'$INSTDIR$\' -Recurse -Filter unregister-identity.ps1 -ErrorAction SilentlyContinue | Select-Object -First 1; if ($$s) { & $$s.FullName } }"'
!macroend
