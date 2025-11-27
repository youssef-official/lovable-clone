from playwright.sync_api import sync_playwright

def verify_admin_login():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Navigate to admin page
        page.goto("http://localhost:3000/admin")

        # Check for login form
        page.wait_for_selector("text=Admin Login")

        # Enter password
        page.fill('input[type="password"]', "Yy654321##")
        page.click('button[type="submit"]')

        # Wait for dashboard to load
        page.wait_for_selector("text=Admin Dashboard")

        # Take screenshot
        page.screenshot(path="verification/admin_dashboard.png")
        print("Screenshot saved to verification/admin_dashboard.png")

        browser.close()

if __name__ == "__main__":
    verify_admin_login()
