# URJA — Smart Electricity Management

URJA is a full-stack electricity-use estimation website. It lets each user create an account, add household appliances, estimate monthly energy use and cost, and view a simple energy breakdown.

## Features
- Account signup and login
- Password hashing with PBKDF2
- Signed bearer-token sessions
- Per-user appliance storage in SQLite
- Monthly and daily kWh estimates
- Adjustable per-unit tariff and bill estimate
- Appliance breakdown chart
- Light and dark themes
- Responsive desktop and mobile layouts
- Energy tips and approximate CO₂ estimate

## Requirements
- Windows 10/11 (64-bit)
- Python 3.11 or newer
- A modern browser
- Internet connection for Google Fonts, Chart.js CDN and the Unsplash background photo

## Run on Windows

Open PowerShell in the `URJA` project folder.

### 1. Create and activate a virtual environment

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
```

If PowerShell blocks activation, use Command Prompt instead, or run this in PowerShell for the current terminal only:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1
```

### 2. Install backend dependencies

```powershell
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

### 3. Start URJA

```powershell
python -m uvicorn backend.main:app --reload
```

Open **http://127.0.0.1:8000** in Chrome.

API health check: http://127.0.0.1:8000/api/health  
Interactive API docs: http://127.0.0.1:8000/docs

Stop the server with `Ctrl + C`.

## Important notes
- Appliance energy is estimated using: watts × quantity × hours per day × days per month ÷ 1000.
- Estimated bill = estimated kWh × the rate entered by the user.
- Actual bills may include fixed charges, taxes, subsidies, time-of-use pricing and tariff slabs. URJA's estimate does not include these.
- CO₂ is a rough illustrative estimate using 0.7 kg CO₂ per kWh. It is not an official emissions calculation.
- The initial tariff is ₹7.50 per kWh as an editable example. Replace it with the rate on your own bill.
- The SQLite database is created automatically at `database/urja.db`.
- This is a learning/development starter. Before public deployment, set a strong `URJA_SECRET_KEY`, use HTTPS, add rate limiting, email verification, password reset, secure cookie-based sessions or another hardened auth flow, backups and a production database.

## Project structure

```text
URJA/
├── backend/
│   └── main.py
├── database/
│   └── (urja.db is created automatically)
├── frontend/
│   ├── assets/
│   │   └── urja-logo.svg
│   ├── css/
│   │   └── styles.css
│   ├── js/
│   │   └── app.js
│   └── index.html
├── requirements.txt
└── README.md
```
