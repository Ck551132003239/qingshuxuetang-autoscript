// ==UserScript==
// @name         2026学习小助手第一版
// @namespace    https://teach.ynou.edu.cn
// @version      1.0.0
// @match        *://teach.ynou.edu.cn/*
// @match        *://*/*
// @description  整合学习小助手和课程章节获取器，支持自动提交作业、多线程刷课和可视化管理
// @author       Assistant
// @grant        GM_setValue
// @grant        GM_listValues
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @require      https://code.jquery.com/jquery-3.6.0.min.js
// ==/UserScript==

(function() {
    'use strict';

    // 全局变量
    let courseId = null;
    let basePath = '';
    let chapters = [];
    let isAutoPlaying = false;
    let currentPlayIndex = 0;
    let allResources = [];
    let selectedResources = [];
    let playInterval = null;
    let workerPool = [];
    let maxThreads = 30;
    let isWindowVisible = true;
    let isWindowMinimized = false;
    let windowOpacity = 0.9;
    let logs = [];
    let homeworkList = [];
    
    // 进度跟踪变量
    let completedResources = 0;
    let totalResourcesToPlay = 0;
    let currentPlayingResource = null;
    let currentResourceProgress = 0;

    // 主控制面板
    function createMainPanel() {
        const panel = document.createElement('div');
        panel.id = 'study-assistant-panel';
        panel.style.cssText = `
            position: fixed;
            top: 50px;
            right: 20px;
            width: 800px;
            height: 600px;
            background: rgba(255, 255, 255, ${windowOpacity});
            border-radius: 10px;
            box-shadow: 0 5px 20px rgba(0,0,0,0.3);
            z-index: 10000;
            overflow: hidden;
            transition: all 0.3s ease;
            resize: both;
            min-width: 400px;
            min-height: 300px;
        `;

        // 面板头部
        const header = document.createElement('div');
        header.style.cssText = `
            background: #4CAF50;
            color: white;
            padding: 15px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            cursor: move;
        `;
        header.innerHTML = `
            <h2 style="margin: 0; font-size: 18px;">学习助手增强版</h2>
            <div>
                <button id="minimize-btn" style="background: transparent; border: none; color: white; cursor: pointer; margin-right: 10px;">−</button>
                <button id="close-btn" style="background: transparent; border: none; color: white; cursor: pointer;">×</button>
            </div>
        `;

        // 标签页导航
        const tabs = document.createElement('div');
        tabs.style.cssText = `
            background: #f5f5f5;
            border-bottom: 1px solid #ddd;
            display: flex;
        `;
        tabs.innerHTML = `
            <button class="tab-btn active" data-tab="chapters" style="padding: 10px 20px; border: none; background: white; cursor: pointer; border-bottom: 2px solid #4CAF50;">课程章节</button>
            <button class="tab-btn" data-tab="progress" style="padding: 10px 20px; border: none; background: #f5f5f5; cursor: pointer;">学习进度</button>
            <button class="tab-btn" data-tab="logs" style="padding: 10px 20px; border: none; background: #f5f5f5; cursor: pointer;">运行日志</button>
            <button class="tab-btn" data-tab="homework" style="padding: 10px 20px; border: none; background: #f5f5f5; cursor: pointer;">作业管理</button>
        `;

        // 标签页内容
        const tabContent = document.createElement('div');
        tabContent.id = 'tab-content';
        tabContent.style.cssText = `
            height: calc(100% - 110px);
            overflow-y: auto;
            padding: 20px;
        `;

        // 课程章节标签页
        const chaptersTab = document.createElement('div');
        chaptersTab.id = 'chapters-tab';
        chaptersTab.className = 'tab-panel active';
        chaptersTab.innerHTML = `
            <div style="margin-bottom: 20px;">
                <button id="fetch-chapters" style="background: #4CAF50; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer;">📚 获取章节</button>
                <button id="start-auto-play" style="background: #2196F3; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; margin-left: 10px;">▶️ 开始刷课</button>
                <button id="stop-auto-play" style="background: #f44336; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; margin-left: 10px; display: none;">⏹️ 停止刷课</button>
                <div style="margin-top: 10px; font-size: 14px; color: #666;">
                    <label>线程数: <input type="number" id="thread-count" value="${maxThreads}" min="1" max="30" style="width: 50px; margin: 0 10px;"></label>
                    <span id="selection-info">已选择: 0 个资源</span>
                </div>
            </div>
            <div style="margin-bottom: 15px;">
                <label style="margin-right: 15px;">
                    <input type="checkbox" id="select-all-resources" style="margin-right: 5px;"> 全选/取消全选
                </label>
            </div>
            <div id="chapters-container">
                <div style="color: #666; font-style: italic;">点击"获取章节"按钮加载课程信息</div>
            </div>
        `;

        // 学习进度标签页
        const progressTab = document.createElement('div');
        progressTab.id = 'progress-tab';
        progressTab.className = 'tab-panel';
        progressTab.innerHTML = `
            <div id="progress-content">
                <div style="margin-bottom: 20px;">
                    <h3 style="margin: 0 0 10px 0; color: #333;">课程学习进度</h3>
                    <div style="margin-bottom: 15px;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                            <span>总进度</span>
                            <span id="total-progress-percent">0%</span>
                        </div>
                        <div style="width: 100%; height: 20px; background-color: #f0f0f0; border-radius: 10px; overflow: hidden;">
                            <div id="total-progress-bar" style="height: 100%; width: 0%; background-color: #4CAF50; transition: width 0.3s ease;"></div>
                        </div>
                    </div>
                    <div style="margin-bottom: 15px;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                            <span>当前播放</span>
                            <span id="current-progress-percent">0%</span>
                        </div>
                        <div style="width: 100%; height: 20px; background-color: #f0f0f0; border-radius: 10px; overflow: hidden;">
                            <div id="current-progress-bar" style="height: 100%; width: 0%; background-color: #2196F3; transition: width 0.3s ease;"></div>
                        </div>
                    </div>
                    <div id="progress-stats" style="font-size: 14px; color: #666;">
                        <div>已完成: <span id="completed-count">0</span> 个资源</div>
                        <div>总资源: <span id="total-count">0</span> 个资源</div>
                        <div>当前播放: <span id="current-resource">无</span></div>
                    </div>
                </div>
                <div id="resource-progress-list" style="margin-top: 20px;">
                    <h4 style="margin: 0 0 10px 0; color: #333;">资源进度详情</h4>
                    <div style="max-height: 300px; overflow-y: auto;">
                        <div id="resource-progress-items" style="color: #666; font-style: italic;">加载资源进度...</div>
                    </div>
                </div>
            </div>
        `;

        // 运行日志标签页
        const logsTab = document.createElement('div');
        logsTab.id = 'logs-tab';
        logsTab.className = 'tab-panel';
        logsTab.innerHTML = `
            <div id="logs-content" style="font-family: monospace; font-size: 12px; line-height: 1.5;">
                <div style="color: #666; font-style: italic;">运行日志将显示在这里</div>
            </div>
        `;

        // 作业管理标签页
        const homeworkTab = document.createElement('div');
        homeworkTab.id = 'homework-tab';
        homeworkTab.className = 'tab-panel';
        homeworkTab.innerHTML = `
            <div style="margin-bottom: 20px;">
                <button id="open-homework-btn" style="background: #4CAF50; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; margin-right: 10px;">📝 打开作业界面</button>
                <button id="fill-answers-btn" style="background: #2196F3; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; margin-right: 10px;">✏️ 填充答案</button>
                <button id="submit-homework-btn" style="background: #f44336; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; margin-right: 10px;">📤 提交作业</button>
                <button id="auto-homework-btn" style="background: #ff9800; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer;">🤖 自动作业流程</button>
            </div>
            <div id="homework-content">
                <div style="color: #666; font-style: italic;">加载作业信息...</div>
            </div>
        `;

        // 组装面板
        tabContent.appendChild(chaptersTab);
        tabContent.appendChild(progressTab);
        tabContent.appendChild(logsTab);
        tabContent.appendChild(homeworkTab);

        panel.appendChild(header);
        panel.appendChild(tabs);
        panel.appendChild(tabContent);

        document.body.appendChild(panel);

        // 绑定事件
        bindPanelEvents(panel, header);
        bindTabEvents();
        bindChapterEvents();
        bindHomeworkEvents();
    }

    // 绑定面板事件
    function bindPanelEvents(panel, header) {
        // 拖拽功能
        let isDragging = false;
        let startX, startY, startLeft, startTop;

        header.addEventListener('mousedown', (e) => {
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            startLeft = panel.offsetLeft;
            startTop = panel.offsetTop;
            document.addEventListener('mousemove', onDrag);
            document.addEventListener('mouseup', stopDrag);
        });

        function onDrag(e) {
            if (isDragging) {
                const deltaX = e.clientX - startX;
                const deltaY = e.clientY - startY;
                panel.style.left = `${startLeft + deltaX}px`;
                panel.style.top = `${startTop + deltaY}px`;
            }
        }

        function stopDrag() {
            isDragging = false;
            document.removeEventListener('mousemove', onDrag);
            document.removeEventListener('mouseup', stopDrag);
        }

        // 关闭按钮
        document.getElementById('close-btn').addEventListener('click', () => {
            panel.style.display = 'none';
            isWindowVisible = false;
        });

        // 最小化按钮
        document.getElementById('minimize-btn').addEventListener('click', () => {
            if (isWindowMinimized) {
                panel.style.height = '600px';
                document.getElementById('minimize-btn').textContent = '−';
            } else {
                panel.style.height = '50px';
                document.getElementById('minimize-btn').textContent = '+';
            }
            isWindowMinimized = !isWindowMinimized;
        });
    }

    // 绑定标签页事件
    function bindTabEvents() {
        $('.tab-btn').click(function() {
            // 移除所有active类
            $('.tab-btn').removeClass('active').css({'background': '#f5f5f5', 'border-bottom': 'none'});
            $('.tab-panel').removeClass('active').hide();
            
            // 添加当前active类
            $(this).addClass('active').css({'background': 'white', 'border-bottom': '2px solid #4CAF50'});
            const tabId = $(this).data('tab') + '-tab';
            $('#' + tabId).addClass('active').show();
            
            // 如果切换到作业管理标签页，加载作业列表
            if (tabId === 'homework-tab') {
                loadHomeworkList();
            }
        });
    }

    // 绑定章节相关事件
    function bindChapterEvents() {
        // 获取章节按钮
        $('#fetch-chapters').click(function() {
            detectAndFetchCourseInfo();
        });

        // 开始刷课按钮
        $('#start-auto-play').click(function() {
            startMultiThreadPlay();
        });

        // 停止刷课按钮
        $('#stop-auto-play').click(function() {
            stopMultiThreadPlay();
        });

        // 线程数调整
        $('#thread-count').change(function() {
            maxThreads = parseInt($(this).val());
        });

        // 全选/取消全选
        $('#select-all-resources').change(function() {
            const isChecked = $(this).prop('checked');
            $('.resource-checkbox').prop('checked', isChecked);
            updateSelectedResources();
        });
    }

    // 绑定作业相关事件
    function bindHomeworkEvents() {
        // 打开作业界面按钮
        $('#open-homework-btn').click(function() {
            openHomeworkInterface();
        });

        // 填充答案按钮
        $('#fill-answers-btn').click(function() {
            fillHomeworkAnswers();
        });

        // 提交作业按钮
        $('#submit-homework-btn').click(async function() {
            await submitHomework();
        });

        // 自动作业流程按钮
        $('#auto-homework-btn').click(async function() {
            await autoHomeworkProcess();
        });
    }

    // 自动作业流程
    async function autoHomeworkProcess() {
        log('开始自动作业流程...', 'info');
        showNotification('开始自动作业流程', 'info');
        
        const homeworkTitle = $('.shijuantitle > h1').text();
        if (homeworkTitle === '') {
            log('当前不在作业界面，请先打开作业界面', 'warning');
            showNotification('当前不在作业界面，请先打开作业界面', 'warning');
            return;
        }
        
        // 检查是否有已保存的答案
        let savedAnswers = GM_getValue(homeworkTitle);
        
        if (!savedAnswers || Object.keys(savedAnswers).length === 0) {
            log('未找到已保存的答案，将执行完整作业流程', 'info');
            
            // 1. 直接提交作业（获取答案）
            await submitHomework();
            
            // 2. 重新获取保存的答案
            savedAnswers = GM_getValue(homeworkTitle);
            
            if (savedAnswers && Object.keys(savedAnswers).length > 0) {
                log('答案已保存，正在重新填充并提交', 'info');
                
                // 3. 等待页面加载
                await wait(2000);
                
                // 4. 填充答案
                await fillHomeworkAnswers();
                
                // 5. 再次提交作业
                await submitHomework();
            } else {
                log('未能成功保存答案，请检查作业页面', 'error');
                showNotification('未能成功保存答案，请检查作业页面', 'error');
            }
        } else {
            log('已找到保存的答案，直接填充并提交', 'info');
            
            // 1. 填充答案
            await fillHomeworkAnswers();
            
            // 2. 提交作业
            await submitHomework();
        }
        
        log('自动作业流程完成', 'success');
        showNotification('自动作业流程完成', 'success');
    }

    // 显示日志
    function log(message, type = 'info') {
        console.log(message);
        
        // 添加到日志数组
        const logEntry = {
            time: new Date().toLocaleTimeString(),
            message: message,
            type: type
        };
        logs.push(logEntry);
        
        // 限制日志数量
        if (logs.length > 100) {
            logs.shift();
        }
        
        // 更新日志显示
        updateLogsDisplay();
    }

    // 更新日志显示
    function updateLogsDisplay() {
        const logsContent = $('#logs-content');
        let html = '';
        
        logs.forEach(log => {
            const colorMap = {
                success: '#4CAF50',
                error: '#f44336',
                warning: '#ff9800',
                info: '#2196F3'
            };
            html += `<div style="color: ${colorMap[log.type] || '#333'};">[${log.time}] ${log.message}</div>`;
        });
        
        logsContent.html(html);
        logsContent.scrollTop(logsContent[0].scrollHeight);
    }

    // 显示通知
    function showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            z-index: 10002;
            padding: 12px 20px;
            border-radius: 5px;
            color: white;
            font-size: 14px;
            max-width: 300px;
            word-wrap: break-word;
            transition: all 0.3s ease;
        `;
        
        const colors = {
            success: '#4CAF50',
            error: '#f44336',
            warning: '#ff9800',
            info: '#2196F3'
        };
        
        notification.style.background = colors[type] || colors.info;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            if (notification.parentNode) {
                notification.style.opacity = '0';
                notification.style.transform = 'translateX(100%)';
                setTimeout(() => {
                    notification.remove();
                }, 300);
            }
        }, 3000);
    }

    // 获取课程ID
    function getCourseId() {
        if (typeof window.courseId !== 'undefined') {
            return window.courseId;
        }
        
        const urlParams = new URLSearchParams(window.location.search);
        const courseIdFromUrl = urlParams.get('courseId');
        if (courseIdFromUrl) {
            return courseIdFromUrl;
        }
        
        const courseIdElement = document.querySelector('[data-course-id]');
        if (courseIdElement) {
            return courseIdElement.getAttribute('data-course-id');
        }
        
        return null;
    }
    
    // 获取班级ID
    function getClassId() {
        if (typeof window.classId !== 'undefined') {
            return window.classId;
        }
        
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('classId');
    }
    
    // 获取用户名
    function getUsername() {
        if (typeof window.username !== 'undefined') {
            return window.username;
        }
        
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('username');
    }

    // 检测页面中的课程信息
    function detectAndFetchCourseInfo() {
        courseId = getCourseId();
        
        if (typeof window.basePath !== 'undefined') {
            basePath = window.basePath;
        } else {
            basePath = window.location.origin;
        }
        
        if (courseId) {
            fetchCourseChapters();
        } else {
            showNotification('未找到课程ID，请确保在课程页面使用此脚本', 'error');
            log('未找到课程ID，请确保在课程页面使用此脚本', 'error');
        }
     }

    // 获取课程章节
    async function fetchCourseChapters() {
        log('正在获取课程章节...', 'info');
        showNotification('正在获取课程章节...', 'info');
        
        const url = `${basePath}/eduCourseBaseinfo/courseCatalog.action`;
        const formData = new FormData();
        formData.append('courseId', courseId);
        
        const classId = getClassId();
        const username = getUsername();
        if (classId) formData.append('classId', classId);
        if (username) formData.append('username', username);
        
        try {
            const response = await fetch(url, {
                method: 'POST',
                body: formData,
                headers: {
                    'X-Requested-With': 'XMLHttpRequest'
                },
                credentials: 'include'
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            if (data && data.list) {
                chapters = data.list;
                processChapters();
                showChapters();
                showNotification(`成功获取 ${chapters.length} 个章节`, 'success');
                log(`成功获取 ${chapters.length} 个章节`, 'success');
            } else {
                showNotification('获取章节失败：数据格式错误', 'error');
                log('获取章节失败：数据格式错误', 'error');
            }
        } catch (error) {
            console.error('获取章节失败:', error);
            showNotification('获取章节失败：' + error.message, 'error');
            log('获取章节失败：' + error.message, 'error');
        }
    }

    // 处理章节数据
    function processChapters() {
        chapters.forEach((chapter, index) => {
            chapter.index = index + 1;
            fetchChapterResources(chapter);
        });
    }

    // 获取章节资源
    async function fetchChapterResources(chapter) {
        const url = `${basePath}/eduCourseBaseinfo/courseMulu.action`;
        const classId = getClassId();
        const username = getUsername();
        
        const formData = new FormData();
        formData.append('frameId', chapter.conFrameCode);
        formData.append('classId', classId);
        formData.append('courseId', courseId);
        formData.append('courseCode', chapter.courseConCode);
        formData.append('username', username);
        
        try {
            const response = await fetch(url, {
                method: 'POST',
                body: formData,
                headers: {
                    'X-Requested-With': 'XMLHttpRequest'
                },
                credentials: 'include'
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            if (data && data.done && data.activityList) {
                chapter.resources = data.activityList.filter(activity => activity.displayFalg == "1");
                updateChapterDisplay(chapter);
                collectAllResources();
            }
        } catch (error) {
            console.error('获取章节资源失败:', error);
            log('获取章节资源失败：' + error.message, 'error');
        }
    }

    // 收集所有资源
    function collectAllResources() {
        allResources = [];
        chapters.forEach(chapter => {
            if (chapter.resources) {
                chapter.resources.forEach(resource => {
                    if (resource.res && resource.res.rcode) {
                        allResources.push({
                            chapterName: chapter.conFrameName,
                            resourceName: resource.conActivityName,
                            rcode: resource.res.rcode,
                            conActivityId: resource.conActivityId,
                            resourceType: resource.res.istran || 'unknown',
                            rbtimesd: resource.res.rbtimesd || 0,
                            duration: resource.res.duration || 0
                        });
                    }
                });
            }
        });
    }

    // 显示章节
    function showChapters() {
        const container = $('#chapters-container');
        container.html(generateChaptersHTML());
    }

    // 生成章节HTML
    function generateChaptersHTML() {
        let html = '<div style="font-family: Arial, sans-serif;">';
        
        chapters.forEach(chapter => {
            html += `
                <div style="border: 1px solid #ddd; margin-bottom: 15px; border-radius: 5px; overflow: hidden;">
                    <div style="background: #f5f5f5; padding: 15px; font-weight: bold; color: #333;">
                        <span style="color: #666; margin-right: 10px;">${chapter.index}.</span>
                        ${chapter.conFrameName}
                        <span style="float: right; font-size: 12px; color: #999;">
                            章节代码: ${chapter.conFrameCode} | 活动数: ${chapter.hasActivity}
                        </span>
                    </div>
                    <div id="chapter-${chapter.conFrameCode}" style="padding: 15px; background: white;">
                        <div style="color: #666; font-style: italic;">正在加载资源...</div>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        return html;
    }

    // 更新章节显示
    function updateChapterDisplay(chapter) {
        const container = $(`#chapter-${chapter.conFrameCode}`);
        if (!container.length) return;

        let html = '';
        if (chapter.resources && chapter.resources.length > 0) {
            html += '<div style="margin-bottom: 10px;">';
            
            chapter.resources.forEach((resource, index) => {
                let typeDesc = getResourceTypeDescription(resource.conActivityKind);
                let resourceInfo = '';
                
                if (resource.conActivityKind == 2 && resource.res) {
                    const resourceType = resource.res.istran || '未知';
                    const duration = resource.res.rbtimesd ? `${Math.ceil(resource.res.rbtimesd/60)}分钟` : '';
                    resourceInfo = `类型: ${resourceType}${duration ? ` | 时长: ${duration}` : ''}`;
                } else if (resource.conActivityKind == 1) {
                    resourceInfo = '类型: 作业';
                } else if (resource.conActivityKind == 30) {
                    resourceInfo = '类型: 考试';
                }
                
                html += `
                    <div style="padding: 8px; margin-bottom: 5px; border-left: 3px solid #2196F3; background: #f9f9f9;">
                        <div style="display: flex; align-items: center; margin-bottom: 3px;">
                            <label style="display: flex; align-items: center; margin-right: 10px;">
                                <input type="checkbox" class="resource-checkbox" 
                                       data-rcode="${resource.res ? resource.res.rcode : ''}" 
                                       data-chapter="${chapter.conFrameName}"
                                       data-resource="${resource.conActivityName}"
                                       data-duration="${resource.res ? (resource.res.rbtimesd || 0) : 0}"
                                       style="margin-right: 5px;" 
                                       onchange="updateSelectedResources()">
                            </label>
                            <div style="font-weight: bold; color: #333;">
                                ${index + 1}. ${resource.conActivityName}
                            </div>
                        </div>
                        <div style="font-size: 12px; color: #666; margin-left: 25px;">
                            ${typeDesc} | ID: ${resource.conActivityId}
                            ${resourceInfo ? ` | ${resourceInfo}` : ''}
                        </div>
                    </div>
                `;
            });
            
            html += '</div>';
        } else {
            html = '<div style="color: #999; font-style: italic;">该章节暂无资源</div>';
        }

        container.html(html);
    }

    // 获取资源类型描述
    function getResourceTypeDescription(kind) {
        const typeMap = {
            1: '作业',
            2: '资源',
            3: '标签',
            30: '考试',
            31: '讨论'
        };
        return typeMap[kind] || '未知类型';
    }

    // 更新选中的资源
    window.updateSelectedResources = function() {
        selectedResources = [];
        $('.resource-checkbox:checked').each(function() {
            const rcode = $(this).data('rcode');
            if (rcode) {
                selectedResources.push({
                    chapterName: $(this).data('chapter'),
                    resourceName: $(this).data('resource'),
                    rcode: rcode,
                    duration: parseInt($(this).data('duration')) || 0
                });
            }
        });
        
        const totalDuration = selectedResources.reduce((sum, resource) => sum + resource.duration, 0);
        const durationText = totalDuration > 0 ? ` (预计 ${Math.ceil(totalDuration/60)} 分钟)` : '';
        $('#selection-info').text(`已选择: ${selectedResources.length} 个资源${durationText}`);
        
        const selectAllCheckbox = $('#select-all-resources');
        const allCheckboxes = $('.resource-checkbox');
        const checkedCount = $('.resource-checkbox:checked').length;
        selectAllCheckbox.prop('checked', checkedCount === allCheckboxes.length);
        selectAllCheckbox.prop('indeterminate', checkedCount > 0 && checkedCount < allCheckboxes.length);
    }

    // 多线程播放
    function startMultiThreadPlay() {
        if (selectedResources.length === 0) {
            showNotification('请先选择要播放的资源', 'warning');
            log('请先选择要播放的资源', 'warning');
            return;
        }

        isAutoPlaying = true;
        $('#start-auto-play').hide();
        $('#stop-auto-play').show();
        
        log(`开始多线程播放，共 ${selectedResources.length} 个资源，使用 ${maxThreads} 个线程`, 'info');
        showNotification(`开始多线程播放，共 ${selectedResources.length} 个资源`, 'info');
        
        // 初始化进度
        initProgress();
        
        // 初始化工作线程池
        initWorkerPool();
        
        // 分发任务
        distributeTasks();
    }

    // 初始化工作线程池
    function initWorkerPool() {
        // 清空现有线程池
        workerPool.forEach(poolItem => {
            try {
                poolItem.worker.terminate();
            } catch (error) {
                console.error('终止工作线程失败:', error);
            }
        });
        workerPool = [];
        
        // 确保线程数在合理范围内
        maxThreads = Math.max(1, Math.min(30, maxThreads));
        
        // 创建新的工作线程
        for (let i = 0; i < maxThreads; i++) {
            try {
                const worker = createWorker();
                workerPool.push({
                    worker: worker,
                    isBusy: false,
                    currentResource: null,
                    id: i + 1
                });
            } catch (error) {
                console.error('创建工作线程失败:', error);
                log('创建工作线程失败: ' + error.message, 'error');
            }
        }
    }

    // 创建工作线程
    function createWorker() {
        // 使用Blob创建Worker脚本
        const workerScript = `
            self.onmessage = function(e) {
                const { resource, basePath, courseId, classId } = e.data;
                playResource(resource, basePath, courseId, classId);
            };

            async function playResource(resource, basePath, courseId, classId) {
                try {
                    const playData = await getPlayData(resource, basePath, classId);
                    if (playData) {
                        const realResId = playData.resId || resource.rcode;
                        await simulatePlayback(playData, resource, realResId, basePath, courseId, classId);
                        self.postMessage({ type: 'completed', resource: resource });
                    }
                } catch (error) {
                    self.postMessage({ type: 'error', resource: resource, error: error.message });
                }
            }

            async function getPlayData(resource, basePath, classId) {
                const url = \`\${basePath}/play/returnPlayUrl.action\`;
                const formData = new FormData();
                formData.append('pkId', resource.rcode);
                formData.append('classId', classId);

                const response = await fetch(url, {
                    method: 'POST',
                    body: formData,
                    headers: {
                        'X-Requested-With': 'XMLHttpRequest'
                    },
                    credentials: 'include'
                });

                if (!response.ok) {
                    throw new Error(\`HTTP \${response.status}: \${response.statusText}\`);
                }

                return await response.json();
            }

            async function simulatePlayback(playData, resource, realResId, basePath, courseId, classId) {
                let totalTime = 60;
                if (playData.totalTime && playData.totalTime > 0) {
                    totalTime = playData.totalTime;
                } else if (resource.duration && resource.duration > 0) {
                    totalTime = resource.duration;
                } else if (resource.rbtimesd && resource.rbtimesd > 0) {
                    totalTime = resource.rbtimesd;
                }

                const reportInterval = 10;
                await sendViewReport(realResId, totalTime, 0, basePath, courseId, classId);

                for (let currentTime = reportInterval; currentTime <= totalTime; currentTime += reportInterval) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    await sendViewReport(realResId, totalTime, currentTime, basePath, courseId, classId);
                    // 发送进度更新
                    const progress = Math.round((currentTime / totalTime) * 100);
                    self.postMessage({ type: 'progress', resource: resource, progress: progress });
                }

                await sendViewReport(realResId, totalTime, totalTime, basePath, courseId, classId);
                // 发送完成进度
                self.postMessage({ type: 'progress', resource: resource, progress: 100 });
            }

            async function sendViewReport(resId, videoLen, viewLen, basePath, courseId, classId) {
                const reportUrl = \`\${basePath}/play/viewReport.action?pkId=\${resId}&courseId=\${courseId}&videoLen=\${videoLen}&viewLen=\${viewLen}&classId=\${classId}\`;
                await fetch(reportUrl, {
                    method: 'GET',
                    credentials: 'include',
                    timeout: 9000
                });
            }
        `;

        const blob = new Blob([workerScript], { type: 'application/javascript' });
        const workerUrl = URL.createObjectURL(blob);
        return new Worker(workerUrl);
    }

    // 分发任务
    function distributeTasks() {
        const classId = getClassId();
        let taskIndex = 0;
        
        // 为每个空闲线程分配任务
        function assignTask() {
            if (!isAutoPlaying || taskIndex >= selectedResources.length) {
                checkIfAllTasksCompleted();
                return;
            }
            
            // 查找空闲线程
            const idleWorker = workerPool.find(worker => !worker.isBusy);
            if (idleWorker) {
                const resource = selectedResources[taskIndex];
                idleWorker.isBusy = true;
                idleWorker.currentResource = resource;
                
                // 监听线程消息
                idleWorker.worker.onmessage = function(e) {
                    const { type, resource, error, progress } = e.data;
                    if (type === 'progress') {
                        setCurrentPlayingResource(resource);
                        updateCurrentResourceProgress(progress);
                    } else if (type === 'completed') {
                        log(`资源播放完成: ${resource.chapterName} - ${resource.resourceName}`, 'success');
                        markResourceAsCompleted();
                    } else if (type === 'error') {
                        log(`资源播放失败: ${resource.chapterName} - ${resource.resourceName}, 错误: ${error}`, 'error');
                        markResourceAsCompleted();
                    }
                    if (type === 'completed' || type === 'error') {
                        idleWorker.isBusy = false;
                        idleWorker.currentResource = null;
                        assignTask(); // 继续分配任务
                    }
                };
                
                // 发送任务给线程
                idleWorker.worker.postMessage({
                    resource: resource,
                    basePath: basePath,
                    courseId: courseId,
                    classId: classId
                });
                
                taskIndex++;
            }
        }
        
        // 持续分配任务
        const assignInterval = setInterval(() => {
            if (!isAutoPlaying) {
                clearInterval(assignInterval);
                return;
            }
            assignTask();
        }, 100);
    }

    // 检查是否所有任务都已完成
    function checkIfAllTasksCompleted() {
        const allCompleted = workerPool.every(worker => !worker.isBusy) && currentPlayIndex >= selectedResources.length;
        if (allCompleted && isAutoPlaying) {
            stopMultiThreadPlay();
            log('所有资源播放完成', 'success');
            showNotification('所有资源播放完成！', 'success');
        }
    }

    // 停止多线程播放
    function stopMultiThreadPlay() {
        isAutoPlaying = false;
        $('#start-auto-play').show();
        $('#stop-auto-play').hide();
        
        // 终止所有工作线程
        workerPool.forEach(worker => {
            worker.worker.terminate();
        });
        workerPool = [];
        
        log('多线程播放已停止', 'info');
        showNotification('自动播放已停止', 'info');
    }

    // 打开作业界面
    function openHomeworkInterface() {
        log('正在打开作业界面...', 'info');
        showNotification('正在尝试打开作业界面', 'info');
        
        // 检查当前是否在课程首页
        if (window.location.pathname.includes('webindex.action')) {
            // 尝试在课程首页找到作业入口
            const homeworkLinks = $('a[href*="hw/"]');
            if (homeworkLinks.length > 0) {
                log('找到作业入口，正在打开...', 'info');
                homeworkLinks[0].click();
            } else {
                log('未找到作业入口，请手动打开作业界面', 'warning');
                showNotification('未找到作业入口，请手动打开作业界面', 'warning');
            }
        } else {
            // 提示用户当前位置
            log('请先进入课程首页，再点击打开作业界面', 'warning');
            showNotification('请先进入课程首页，再点击打开作业界面', 'warning');
        }
    }

    // 填充作业答案
    async function fillHomeworkAnswers() {
        const homeworkTitle = $('.shijuantitle > h1').text();
        if (homeworkTitle === '') {
            log('当前不在作业界面，请先打开作业界面', 'warning');
            showNotification('当前不在作业界面，请先打开作业界面', 'warning');
            return;
        }
        
        let savedAnswers = GM_getValue(homeworkTitle);
        if (!savedAnswers || Object.keys(savedAnswers).length === 0) {
            log('未找到该作业的答案，请先完成一次作业以保存答案', 'warning');
            showNotification('未找到该作业的答案，请先完成一次作业以保存答案', 'warning');
            return;
        }
        
        log(`作业: ${homeworkTitle} 正在读取填充 ${Object.keys(savedAnswers).length} 条答案`, 'info');
        showNotification(`正在填充作业答案，共 ${Object.keys(savedAnswers).length} 题`, 'info');
        
        await wait(2000);
        
        // 遍历所有题目
        $('.e_juan02biaoti').each(function(index, element) {
            const questionElement = $(element);
            const answer = savedAnswers[index];
            
            if (!answer) {
                log(`第 ${index + 1} 题未找到答案`, 'warning');
                return;
            }
            
            // 显示答案
            questionElement.append('<div style="color: blue; margin-top: 5px; font-weight: bold;">答案：' + answer + '</div>');
            
            // 处理不同题型
            const questionType = getQuestionType(questionElement);
            
            switch (questionType) {
                case 'single': // 单选题
                    fillSingleChoice(questionElement, answer);
                    break;
                case 'multiple': // 多选题
                    fillMultipleChoice(questionElement, answer);
                    break;
                case 'judge': // 判断题
                    fillJudgeQuestion(questionElement, answer);
                    break;
                default: // 其他题型
                    fillGeneralQuestion(questionElement, answer);
                    break;
            }
        });
        
        log('作业答案填充完成，请检查后提交', 'success');
        showNotification('作业答案填充完成，请检查后提交', 'success');
    }

    // 提交作业
    async function submitHomework() {
        log('正在提交作业...', 'info');
        showNotification('正在提交作业', 'info');
        
        // 1. 查找并点击页面最下方的完成作业按钮
        let submitButton = $('[value="完成作业"]');
        if (submitButton.length === 0) {
            // 尝试其他选择器
            submitButton = $('[value*="提交"], [value*="完成"], button:contains("提交"), button:contains("完成")');
        }
        
        if (submitButton.length > 0) {
            log('找到提交按钮，正在提交作业...', 'info');
            submitButton.click();
            await wait(1000);
            
            // 2. 查找并点击确定按钮
            let confirmButton = $('.aui_state_highlight');
            if (confirmButton.length > 0) {
                log('找到确认按钮，正在确认提交...', 'info');
                confirmButton.click();
                await wait(1500);
            }
            
            // 3. 查找并点击查看答题成绩和解析按钮
            await startMonitorTimer('answerPage', () => {
                const answerButton = $('.right_answer > font');
                if (answerButton.length > 0) {
                    log('找到答案按钮，正在查看答题成绩和解析...', 'info');
                    answerButton.click();
                    return true;
                }
                return false;
            }, 200);
            
            // 4. 等待答案页面加载完成
            await startMonitorTimer('answerLoaded', () => {
                if ($('.right_answer').css('display') !== 'none' && $('.right_answer > font').length > 0) {
                    log('答案页面加载完成', 'info');
                    return true;
                }
                return false;
            }, 200);
            
            // 5. 自动保存答案
            await homework();
            
            // 6. 查找并点击重做按钮
            await startMonitorTimer('redoBtn', () => {
                const redoButton = $('#cz');
                if (redoButton.length > 0) {
                    log('找到重做按钮，正在重新开始作业...', 'info');
                    redoButton.click();
                    return true;
                }
                return false;
            }, 200);
            
            // 7. 等待作业页面重新加载
            await wait(2000);
            
            // 8. 自动填充保存的答案
            await fillHomeworkAnswers();
            
        } else {
            log('未找到提交按钮，请手动提交作业', 'warning');
            showNotification('未找到提交按钮，请手动提交作业', 'warning');
        }
    }

    // 获取题目类型
    function getQuestionType(questionElement) {
        const questionText = questionElement.text().toLowerCase();
        
        // 根据题目文本判断题型
        if (questionText.includes('单选') || questionText.includes('单选题')) {
            return 'single';
        } else if (questionText.includes('多选') || questionText.includes('多选题')) {
            return 'multiple';
        } else if (questionText.includes('判断') || questionText.includes('判断题')) {
            return 'judge';
        } 
        
        // 根据选项数量判断
        const options = questionElement.find('[type="radio"]');
        if (options.length > 0) {
            return 'single';
        }
        
        const checkboxes = questionElement.find('[type="checkbox"]');
        if (checkboxes.length > 0) {
            return 'multiple';
        }
        
        return 'general';
    }

    // 填充单选题
    function fillSingleChoice(questionElement, answer) {
        // 单选题答案通常是单个字母
        const answerLetter = answer.trim().toUpperCase();
        
        // 查找并点击对应的单选按钮
        const radioButtons = questionElement.find('[type="radio"]');
        let found = false;
        
        radioButtons.each(function() {
            const radio = $(this);
            if (radio.val().toUpperCase() === answerLetter || radio.next().text().trim().startsWith(answerLetter)) {
                radio.click();
                found = true;
                return false;
            }
        });
        
        if (!found) {
            // 尝试其他方式查找
            questionElement.find(`[value='${answerLetter}']`).click();
        }
    }

    // 填充多选题
    function fillMultipleChoice(questionElement, answer) {
        // 多选题答案通常是多个字母，如"ABC"或"A,B,C"
        const answerLetters = answer.replace(/[^A-Za-z]/g, '').toUpperCase();
        
        // 遍历每个答案字母
        for (let i = 0; i < answerLetters.length; i++) {
            const answerLetter = answerLetters[i];
            
            // 查找并点击对应的复选框
            const checkboxes = questionElement.find('[type="checkbox"]');
            let found = false;
            
            checkboxes.each(function() {
                const checkbox = $(this);
                if (checkbox.val().toUpperCase() === answerLetter || checkbox.next().text().trim().startsWith(answerLetter)) {
                    checkbox.click();
                    found = true;
                    return false;
                }
            });
            
            if (!found) {
                // 尝试其他方式查找
                questionElement.find(`[value='${answerLetter}']`).click();
            }
        }
    }

    // 填充判断题
    function fillJudgeQuestion(questionElement, answer) {
        // 判断题答案通常是"对"、"错"、"正确"、"错误"或"A"、"B"
        const normalizedAnswer = answer.trim().toLowerCase();
        
        // 转换为统一格式
        let judgeAnswer = '';
        if (normalizedAnswer === '对' || normalizedAnswer === '正确' || normalizedAnswer === 'a') {
            judgeAnswer = 'A';
        } else if (normalizedAnswer === '错' || normalizedAnswer === '错误' || normalizedAnswer === 'b') {
            judgeAnswer = 'B';
        }
        
        if (judgeAnswer) {
            // 查找并点击对应的选项
            questionElement.find(`[value='${judgeAnswer}']`).click();
            
            // 尝试其他方式
            const options = questionElement.find('[type="radio"]');
            options.each(function() {
                const option = $(this);
                if (option.val().toUpperCase() === judgeAnswer || option.next().text().trim().startsWith(judgeAnswer)) {
                    option.click();
                    return false;
                }
            });
        }
    }

    // 填充其他题型
    function fillGeneralQuestion(questionElement, answer) {
        // 处理其他题型，如填空题等
        const inputFields = questionElement.find('input[type="text"], textarea');
        if (inputFields.length > 0) {
            inputFields.val(answer);
        } else {
            // 尝试查找其他输入方式
            const options = questionElement.find('.xuanze');
            if (options.length > 0) {
                // 处理特殊格式的选项
                for (let i = 0; i < answer.length; i++) {
                    const answerChar = answer[i];
                    const option = options.eq(i);
                    if (option.length > 0) {
                        option.find(`[value='${answerChar}']`).click();
                    }
                }
            }
        }
    }

    // 作业相关功能（自动保存答案）
    async function homework() {
        const homeworkTitle = $('.shijuantitle > h1').text();
        if (homeworkTitle === '') {
            return;
        }
        
        // 检查是否在答案页面
        if ($('.right_answer > font').length > 0) {
            log(`正在保存作业答案: ${homeworkTitle}`, 'info');
            
            // 保存答案
            const savedAnswers = {};
            const questions = $('.e_juan02biaoti');
            
            questions.each(function(index, element) {
                const questionElement = $(element);
                const answerElement = questionElement.find('.right_answer > font');
                
                if (answerElement.length > 0) {
                    const answer = answerElement.text().trim();
                    savedAnswers[index] = answer;
                    log(`第 ${index + 1} 题答案: ${answer}`, 'info');
                }
            });
            
            if (Object.keys(savedAnswers).length > 0) {
                GM_setValue(homeworkTitle, savedAnswers);
                log(`${homeworkTitle} 的答案已存储，共 ${Object.keys(savedAnswers).length} 题`, 'success');
                showNotification(`${homeworkTitle} 的答案已存储`, 'success');
            } else {
                log(`未找到 ${homeworkTitle} 的答案元素`, 'warning');
            }
        } else if ($('.e_juan02biaoti').length > 0) {
            // 检查是否有已保存的答案
            const savedAnswers = GM_getValue(homeworkTitle);
            if (savedAnswers && Object.keys(savedAnswers).length > 0) {
                log(`发现已保存的答案，正在填充: ${homeworkTitle}`, 'info');
                await fillHomeworkAnswers();
            }
        }
    }

    // 等待函数
    function wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // 监控定时器
    let monitorTimer = {};

    function clearMonitorTimer(timerName) {
        if (monitorTimer[timerName]) {
            clearInterval(monitorTimer[timerName]);
            monitorTimer[timerName] = null;
        }
    }

    function startMonitorTimer(timerName, checkFunction, interval = 100) {
        clearMonitorTimer(timerName);
        return new Promise((resolve, reject) => {
            if (checkFunction()) {
                resolve();
                return;
            }
            
            monitorTimer[timerName] = setInterval(() => {
                if (checkFunction()) {
                    clearMonitorTimer(timerName);
                    resolve();
                }
            }, interval);
        });
    }

    // 更新进度条
    function updateProgress() {
        // 更新总进度
        const totalProgress = totalResourcesToPlay > 0 ? Math.round((completedResources / totalResourcesToPlay) * 100) : 0;
        document.getElementById('total-progress-percent').textContent = `${totalProgress}%`;
        document.getElementById('total-progress-bar').style.width = `${totalProgress}%`;
        
        // 更新当前播放进度
        document.getElementById('current-progress-percent').textContent = `${currentResourceProgress}%`;
        document.getElementById('current-progress-bar').style.width = `${currentResourceProgress}%`;
        
        // 更新统计信息
        document.getElementById('completed-count').textContent = completedResources;
        document.getElementById('total-count').textContent = totalResourcesToPlay;
        document.getElementById('current-resource').textContent = currentPlayingResource ? `${currentPlayingResource.chapterName} - ${currentPlayingResource.resourceName}` : '无';
        
        // 更新资源进度详情
        updateResourceProgressItems();
    }
    
    // 更新资源进度详情列表
    function updateResourceProgressItems() {
        const container = document.getElementById('resource-progress-items');
        if (totalResourcesToPlay === 0) {
            container.innerHTML = '<div style="color: #666; font-style: italic;">暂无资源播放记录</div>';
            return;
        }
        
        let html = '';
        selectedResources.forEach((resource, index) => {
            const isCompleted = index < completedResources;
            const isCurrent = currentPlayingResource && resource.rcode === currentPlayingResource.rcode;
            
            html += `
                <div style="padding: 8px; margin-bottom: 5px; border-left: 3px solid ${isCompleted ? '#4CAF50' : isCurrent ? '#2196F3' : '#ddd'}; background: ${isCurrent ? '#e3f2fd' : '#f9f9f9'};">
                    <div style="font-weight: bold; color: #333; margin-bottom: 3px;">
                        ${resource.chapterName} - ${resource.resourceName}
                    </div>
                    <div style="font-size: 12px; color: #666;">
                        ${isCompleted ? '✅ 已完成' : isCurrent ? `⏯️ 播放中 (${currentResourceProgress}%)` : '⏸️ 未开始'}
                    </div>
                </div>
            `;
        });
        
        container.innerHTML = html;
    }
    
    // 初始化进度
    function initProgress() {
        completedResources = 0;
        totalResourcesToPlay = selectedResources.length;
        currentPlayingResource = null;
        currentResourceProgress = 0;
        updateProgress();
    }
    
    // 设置当前播放资源
    function setCurrentPlayingResource(resource) {
        currentPlayingResource = resource;
        currentResourceProgress = 0;
        updateProgress();
    }
    
    // 更新当前资源进度
    function updateCurrentResourceProgress(progress) {
        currentResourceProgress = Math.min(100, Math.max(0, Math.round(progress)));
        updateProgress();
    }
    
    // 标记资源为已完成
    function markResourceAsCompleted() {
        completedResources++;
        currentPlayingResource = null;
        currentResourceProgress = 0;
        updateProgress();
    }
    
    // 加载作业列表
    function loadHomeworkList() {
        const homeworkContent = $('#homework-content');
        homeworkContent.html('<div style="color: #666; font-style: italic;">加载作业信息...</div>');
        
        // 获取所有存储的作业答案
        const homeworkKeys = GM_listValues().filter(key => key.includes('作业'));
        homeworkList = homeworkKeys.map(key => {
            const answers = GM_getValue(key);
            return {
                title: key,
                answerCount: Object.keys(answers).length,
                isCompleted: true
            };
        });
        
        // 生成作业列表HTML
        let html = '<div style="font-family: Arial, sans-serif;">';
        if (homeworkList.length > 0) {
            homeworkList.forEach((homework, index) => {
                html += `
                    <div style="border: 1px solid #ddd; margin-bottom: 10px; border-radius: 5px; padding: 15px;">
                        <div style="font-weight: bold; color: #333; margin-bottom: 5px;">${index + 1}. ${homework.title}</div>
                        <div style="font-size: 12px; color: #666;">
                            答案数量: ${homework.answerCount} | 状态: <span style="color: #4CAF50;">已完成</span>
                        </div>
                    </div>
                `;
            });
        } else {
            html += '<div style="color: #666; font-style: italic;">暂无已完成的作业</div>';
        }
        html += '</div>';
        
        homeworkContent.html(html);
    }

    // 初始化函数
    function init() {
        // 创建主控制面板
        createMainPanel();
        
        // 监听作业页面加载
        if (window.location.pathname.includes('/hw/')) {
            setTimeout(() => {
                homework();
            }, 1000);
        }
        
        // 添加页面加载完成事件
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function() {
                // 检查是否在作业页面
                if (window.location.pathname.includes('/hw/')) {
                    setTimeout(() => {
                        homework();
                    }, 1000);
                }
            });
        } else {
            // 检查是否在作业页面
            if (window.location.pathname.includes('/hw/')) {
                setTimeout(() => {
                    homework();
                }, 1000);
            }
        }
        
        log('学习助手plus已初始化', 'success');
    }

    // 启动脚本
    init();

})();
