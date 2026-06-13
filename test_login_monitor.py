"""
自动化测试：模拟用户登录角球系统，观察后端日志
1. 打开前端页面
2. 切换到角球系统tab
3. 点击登录
4. 等待数据返回
5. 观察后端日志有无异常
6. 持续轮询2分钟观察是否频繁重新登录
"""
from playwright.sync_api import sync_playwright
import time
import json
import urllib.request

# 先检查后端日志（通过API获取状态）
def check_backend_status():
    try:
        req = urllib.request.Request("http://localhost:3000/api/corner/status")
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read())
            return data
    except Exception as e:
        return {"error": str(e)}

def check_crawler_status():
    try:
        req = urllib.request.Request("http://localhost:3000/api/corner/crawler-status")
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read())
            return data
    except Exception as e:
        return {"error": str(e)}

print("=== 初始状态检查 ===")
status = check_backend_status()
print(f"Corner status: {json.dumps(status, ensure_ascii=False, indent=2)}")

crawler = check_crawler_status()
print(f"Crawler status: {json.dumps(crawler, ensure_ascii=False, indent=2)}")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1920, "height": 1080})
    
    # 收集控制台日志
    console_logs = []
    page.on("console", lambda msg: console_logs.append(f"[{msg.type}] {msg.text}"))
    
    # 收集网络请求
    network_requests = []
    page.on("request", lambda req: network_requests.append(f"{req.method} {req.url}"))
    
    print("\n=== 步骤1: 打开前端页面 ===")
    page.goto("http://localhost:3000", timeout=30000)
    page.wait_for_load_state("networkidle")
    time.sleep(2)
    page.screenshot(path="debug_screenshot_01_home.png")
    print("首页截图已保存")
    
    # 查找角球系统tab
    print("\n=== 步骤2: 切换到角球系统tab ===")
    corner_tab = page.locator("text=角球系统")
    if corner_tab.count() > 0:
        corner_tab.first.click()
        time.sleep(2)
        page.screenshot(path="debug_screenshot_02_corner_tab.png")
        print("角球系统tab截图已保存")
    else:
        print("未找到角球系统tab，尝试其他选择器...")
        # 尝试查找所有tab
        tabs = page.locator("[role='tab'], .tab, button").all()
        for t in tabs:
            txt = t.text_content() or ""
            if "角球" in txt:
                t.click()
                time.sleep(2)
                page.screenshot(path="debug_screenshot_02_corner_tab.png")
                print(f"点击了tab: {txt}")
                break
    
    # 查找登录按钮
    print("\n=== 步骤3: 点击登录 ===")
    login_btn = page.locator("button:has-text('登录'), button:has-text('启动监控'), button:has-text('开始登录')")
    if login_btn.count() > 0:
        print(f"找到登录按钮: {login_btn.first.text_content()}")
        login_btn.first.click()
        print("已点击登录按钮，等待登录过程...")
        time.sleep(15)  # 等待登录完成
        page.screenshot(path="debug_screenshot_03_after_login.png")
        print("登录后截图已保存")
    else:
        print("未找到登录按钮")
        # 列出所有按钮
        buttons = page.locator("button").all()
        print(f"页面上所有按钮 ({len(buttons)}):")
        for b in buttons[:20]:
            print(f"  - {b.text_content()}")
    
    # 检查登录状态
    print("\n=== 步骤4: 检查登录状态 ===")
    crawler = check_crawler_status()
    print(f"Crawler status: {json.dumps(crawler, ensure_ascii=False, indent=2)}")
    
    # 检查是否有数据返回
    print("\n=== 步骤5: 检查数据 ===")
    live_data = None
    try:
        req = urllib.request.Request("http://localhost:3000/api/corner/live")
        with urllib.request.urlopen(req, timeout=10) as resp:
            live_data = json.loads(resp.read())
            matches = live_data.get("data", [])
            main_markets = live_data.get("mainMarkets", {})
            print(f"Live matches: {len(matches)}")
            print(f"Main markets: {len(main_markets)} keys")
            if matches:
                print(f"第一场比赛: {json.dumps(matches[0], ensure_ascii=False)[:200]}")
    except Exception as e:
        print(f"获取live数据失败: {e}")
    
    page.screenshot(path="debug_screenshot_04_data.png")
    
    # 持续观察2分钟，检查是否频繁重新登录
    print("\n=== 步骤6: 持续观察2分钟 ===")
    login_count = 0
    error_count = 0
    poll_count = 0
    start_time = time.time()
    
    while time.time() - start_time < 120:  # 2分钟
        poll_count += 1
        crawler = check_crawler_status()
        
        # 检查是否在重新登录
        is_logged_in = crawler.get("isLoggedIn", False) if isinstance(crawler, dict) else False
        error = crawler.get("error") if isinstance(crawler, dict) else None
        
        if not is_logged_in and poll_count > 1:
            login_count += 1
            print(f"[{poll_count}] ⚠️ 未登录! crawler: {json.dumps(crawler, ensure_ascii=False)[:100]}")
        elif error:
            error_count += 1
            print(f"[{poll_count}] ❌ 错误: {error}")
        else:
            if poll_count % 10 == 0:
                print(f"[{poll_count}] ✅ 正常 (已登录: {is_logged_in})")
        
        time.sleep(5)
    
    print(f"\n=== 观察结果 ===")
    print(f"总轮询次数: {poll_count}")
    print(f"重新登录次数: {login_count}")
    print(f"错误次数: {error_count}")
    
    if login_count > 3:
        print("⚠️ 检测到频繁重新登录！可能被网站检测到自动化行为")
    elif error_count > 5:
        print("⚠️ 频繁出现错误，需要检查")
    else:
        print("✅ 未发现频繁重新登录现象")
    
    # 最终截图
    page.screenshot(path="debug_screenshot_05_final.png")
    
    # 输出控制台日志
    print(f"\n=== 前端控制台日志 (共{len(console_logs)}条) ===")
    for log in console_logs[-30:]:
        print(f"  {log}")
    
    browser.close()

print("\n=== 最终后端状态 ===")
crawler = check_crawler_status()
print(f"Crawler status: {json.dumps(crawler, ensure_ascii=False, indent=2)}")
