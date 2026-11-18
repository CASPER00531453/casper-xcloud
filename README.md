# Casper xCloud

**Xbox Cloud Gaming (xCloud) için Windows uygulaması.** Tek tıkla xCloud'u açar; görüntü, ses, kontrolcü, fare-klavye ve daha fazlası için gelişmiş ayarlar ekler.

**[⬇ Casper xCloud'u indir (Windows)](https://github.com/CASPER00531453/casper-xcloud/releases/latest)** · [Casper Technology](https://casper-technology.vercel.app/)

## Özellikler

- **⚡ xCloud'u hızlı aç:** tek tıkla Casper xCloud'u açar, açılış videosunu ve animasyonları kısaltır, xCloud'u başlatır.
- **Aç / kapat:** büyük güç butonuyla Casper xCloud'u istediğin an aç veya düz xCloud'a dön.
- **Uygulama içi panel:** xCloud penceresinde sağ alttaki ⚙ butonu veya **Ctrl+Shift+X** ile tüm ayarlar oyundan çıkmadan elinin altında.
- **Gelişmiş ayarlar:** çözünürlük, görüntü kalitesi, netleştirme, FPS sınırı, kontrolcü titreşimi, fare-klavye, kısayollar, yayın istatistikleri.
- **Windows ile başlat, tepsiye küçült, açılışta xCloud'u otomatik başlat.**
- **Otomatik güncelleme:** yeni sürüm yayınlandığında uygulama açılışta kendini günceller (imzalı güncellemeler).

## Kurulum

1. [Releases](https://github.com/CASPER00531453/casper-xcloud/releases/latest) sayfasından `Casper-xCloud_x.y.z_x64-setup.exe` dosyasını indir.
2. Çalıştır ve kurulumu tamamla.
3. Casper xCloud'u aç, **⚡ xCloud'u hızlı aç**'a bas ve Microsoft hesabınla giriş yap.

Gereksinim: Windows 10/11 (WebView2, Windows 11'de hazır gelir).

## "Virüs var" uyarısı hakkında

Casper xCloud'un **kaynak kodu bu repoda görülebilir**: ne yaptığını herkes okuyabilir ve kendisi derleyip doğrulayabilir.

Windows SmartScreen'in "Windows bilgisayarınızı korudu" uyarısı veya bazı antivirüslerin şüphe bildirmesi şu sebeplerden olur:

- Kurulum dosyası ücretli bir **kod imzalama sertifikasıyla imzalı değil**, yeni ve az indirilmiş dosyalar bu yüzden "tanınmayan uygulama" sayılır. ("Ek bilgi" → "Yine de çalıştır".)
- Uygulama xbox.com sayfasına Better xCloud script'ini enjekte eder, isteğe bağlı olarak Windows açılışına eklenir (`HKCU\...\Run`) ve kendini GitHub Releases'tan günceller. Bunlar antivirüslerin genel kurallarına takılabilir ama hepsi aşağıdaki kodda açıkça görülür:
  - Script enjeksiyonu ve ayarlar: [`src-tauri/src/lib.rs`](src-tauri/src/lib.rs), [`src-tauri/script/panel.js`](src-tauri/script/panel.js)
  - İzinler (xbox.com sayfası yalnızca birkaç ayar komutunu çağırabilir): [`src-tauri/capabilities/`](src-tauri/capabilities)
  - Güncelleme: [`src/main.ts`](src/main.ts) ve [`src-tauri/tauri.conf.json`](src-tauri/tauri.conf.json) (yalnızca Casper Technology anahtarıyla imzalı sürümler kurulur)

Her release notunda kurulum dosyasının **SHA-256** değeri yazar; indirdiğin dosyayı doğrulamak için:

```powershell
Get-FileHash .\Casper-xCloud_1.0.0_x64-setup.exe -Algorithm SHA256
```

Dosyayı [VirusTotal](https://www.virustotal.com/)'e yükleyip kendin de taratabilirsin.

## Kaynaktan derleme

Gereksinimler: Windows 10/11, [Node.js](https://nodejs.org/) 20+, [Rust](https://rustup.rs/) (stable), WebView2.

```powershell
git clone https://github.com/CASPER00531453/casper-xcloud
cd casper-xcloud
npm install
npx tauri build --no-bundle   # -> src-tauri\target\release\casper-xcloud.exe
```

Kurulum dosyası (`npx tauri build`) güncelleme imzası ister; imza anahtarı olmadan `--no-bundle` ile çalışan exe'yi derleyebilirsin. Geliştirme modu: `npx tauri dev`.

### Proje yapısı

| Yol | Ne |
| --- | --- |
| `src/` | Launcher penceresi (güç butonu, ayarlar, güncelleme) |
| `src-tauri/src/lib.rs` | Uygulama çekirdeği: xCloud penceresi, script enjeksiyonu, tepsi, otomatik başlatma |
| `src-tauri/script/panel.js` | xCloud içindeki ⚙ panel ve "hızlı aç" ayarları |
| `src-tauri/script/better-xcloud.user.js` | Gömülü Better xCloud 6.7.13 (redphx, MIT) |
| `src-tauri/capabilities/` | Hangi pencerenin hangi komutu çağırabileceği |
| `release.ps1` | Yeni sürüm yayınlama (imzalı derleme + GitHub Release) |

## ⚠️ Önemli uyarı

"Hızlı aç" butonu, Xbox Cloud Gaming'in resmi olarak sunulmadığı bölgelerde bölge kısıtını atlamaya çalışan bir ayar içerir. Bu, **Microsoft hizmet koşullarına aykırıdır** ve hesabının kısıtlanmasına yol açabilir. Kullanım riski tamamen kullanıcıya aittir. Ayrıca bu yöntemin her zaman çalışacağı garanti edilmez.

Casper xCloud, Microsoft veya Xbox ile bağlantılı değildir; onlar tarafından onaylanmamıştır. "Xbox" ve "Xbox Cloud Gaming" Microsoft'un ticari markalarıdır.

## Destek

Sorun, öneri ve iletişim için: **[Casper Technology](https://casper-technology.vercel.app/)**

## Lisans ve teşekkür

**© 2026 Casper Technology. Tüm hakları saklıdır.** Kaynak kod yalnızca incelenmek için açıktır; izinsiz kopyalanamaz, değiştirilemez, dağıtılamaz veya başka bir üründe kullanılamaz. Ayrıntılar: [LICENSE](LICENSE).

Casper xCloud, açık kaynaklı **[Better xCloud](https://github.com/redphx/better-xcloud)** (redphx, MIT lisansı) üzerine kuruludur. Lisans metni ve diğer bileşenler için bkz. [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

© 2026 Casper Technology
