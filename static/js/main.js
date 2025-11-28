// File handling and UI interactions
document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const folderInput = document.getElementById('folderInput');
    const progressBar = document.createElement('div');
    progressBar.className = 'progress-bar';
    progressBar.innerHTML = '<div class="progress-bar-fill" style="width: 0%"></div>';
    dropZone.appendChild(progressBar);

    let uploadCount = 0;
    let completedUploads = 0;

    // Drag and drop handlers
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, highlight, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, unhighlight, false);
    });

    function highlight() {
        dropZone.classList.add('dragover');
    }

    function unhighlight() {
        dropZone.classList.remove('dragover');
    }

    dropZone.addEventListener('drop', handleDrop, false);
    fileInput.addEventListener('change', handleFiles, false);
    folderInput.addEventListener('change', handleFiles, false);

    function handleDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        const items = e.dataTransfer.items;
        console.log('Drop event: items', items);
        if (items && items.length && items[0].webkitGetAsEntry) {
            let entries = [];
            for (let i = 0; i < items.length; i++) {
                const entry = items[i].webkitGetAsEntry();
                if (entry) entries.push(entry);
            }
            console.log('Entries from drop:', entries);
            let fileList = [];
            let pending = entries.length;
            if (pending === 0) return;
            entries.forEach(entry => {
                traverseFileTree(entry, '', fileList, () => {
                    pending--;
                    if (pending === 0) {
                        console.log('Final fileList from folder drop:', fileList);
                        processItems(fileList);
                    }
                });
            });
        } else {
            const files = e.dataTransfer.files;
            console.log('Fallback files:', files);
            processItems(Array.from(files));
        }
    }

    // Recursively traverse directories and collect files with relative paths
    function traverseFileTree(item, path, fileList, done) {
        path = path || '';
        if (item.isFile) {
            item.file(file => {
                // Only push real files (size > 0)
                if (file.size > 0) {
                    file.relativePath = path + file.name;
                    fileList.push(file);
                }
                done();
            });
        } else if (item.isDirectory) {
            console.log('Directory found:', path + item.name + '/');
            const dirReader = item.createReader();
            dirReader.readEntries(entries => {
                let remaining = entries.length;
                if (!remaining) return done();
                entries.forEach(entry => {
                    traverseFileTree(entry, path + item.name + '/', fileList, () => {
                        remaining--;
                        if (!remaining) done();
                    });
                });
            });
        }
    }

    function handleFiles(e) {
        const files = [...e.target.files];
        processItems(files);
    }

    function processItems(items) {
        console.log('processItems called with:', items);
        // Reset counters
        uploadCount = items.length;
        completedUploads = 0;
        items.forEach(item => {
            uploadFile(item, item.relativePath || item.name, item.webkitRelativePath ? false : !!item.relativePath && item.relativePath.includes('/'));
        });
    }

    function uploadFile(file, path, isFolder = false) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('path', path.replace(/^\/+/, ''));
        formData.append('isFolder', isFolder ? 'true' : 'false');
        sendUploadRequest(formData, `Uploading file: ${file.name}`);
    }

    function sendUploadRequest(formData, operationMessage) {
        showMessage(operationMessage, 'info');
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/upload', true);

        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
                const percentComplete = (e.loaded / e.total) * 100;
                progressBar.querySelector('.progress-bar-fill').style.width = percentComplete + '%';
                showMessage(`${operationMessage} - ${Math.round(percentComplete)}%`, 'info');
            }
        };

        xhr.onload = () => {
            completedUploads++;
            if (xhr.status === 200) {
                showMessage('Upload completed successfully!', 'success');
                if (completedUploads === uploadCount) {
                    // Only reload when all uploads are complete
                    setTimeout(() => {
                        showMessage('Reloading page...', 'info');
                        window.location.reload();
                    }, 1000);
                }
            } else {
                showError('Upload failed: ' + xhr.responseText);
            }
        };

        xhr.onerror = () => {
            completedUploads++;
            showError('Upload failed. Please try again.');
        };

        xhr.send(formData);
    }

    function showMessage(message, type = 'info') {
        // Disabled all notifications
        return;
    }

    function showError(message) {
        // Disabled all error notifications
        return;
    }
});

// File preview functionality
function previewFile(fileId, type) {
    const modal = document.getElementById('previewModal');
    const title = document.getElementById('previewTitle');
    const content = document.getElementById('previewContent');
    const fileInfo = document.getElementById('fileInfo');
    
    currentPreviewFile = fileId;
    title.textContent = 'Loading...';
    content.innerHTML = '<div class="loading-spinner"></div>';
    fileInfo.innerHTML = '<div class="loading-spinner"></div>';
    modal.showModal();

    // Fetch file information
    fetch(`/file-info/${fileId}`)
        .then(response => response.json())
        .then(info => {
            title.textContent = info.name;
            fileInfo.innerHTML = `
                <div>
                    <p class="text-sm font-semibold mb-1">Type</p>
                    <p>${info.type} ${info.mime_type ? `(${info.mime_type})` : ''}</p>
                </div>
                <div>
                    <p class="text-sm font-semibold mb-1">Size</p>
                    <p>${info.size}</p>
                </div>
                <div>
                    <p class="text-sm font-semibold mb-1">Created</p>
                    <p>${info.created}</p>
                </div>
                <div>
                    <p class="text-sm font-semibold mb-1">Device</p>
                    <p>${info.device_info}</p>
                </div>
            `;
        })
        .catch(error => {
            fileInfo.innerHTML = `<div class="error-message">Failed to load file information</div>`;
        });

    // Fetch and display preview
    fetch(`/preview/${fileId}`)
        .then(response => {
            if (!response.ok) throw new Error('Preview failed');
            if (type === 'text' || type === 'code') {
                return response.json();
            }
            return response.blob();
        })
        .then(data => {
            content.innerHTML = '';
            if (type === 'text' || type === 'code') {
                const pre = document.createElement('pre');
                pre.className = 'language-' + (type === 'code' ? 'javascript' : 'plaintext');
                pre.textContent = data.content;
                content.appendChild(pre);
            } else if (type === 'image') {
                const img = document.createElement('img');
                img.src = URL.createObjectURL(data);
                img.className = 'max-w-full h-auto';
                content.appendChild(img);
            } else if (type === 'video') {
                const video = document.createElement('video');
                video.controls = true;
                video.autoplay = false;
                video.className = 'w-full';
                video.src = URL.createObjectURL(data);
                content.appendChild(video);
            } else if (type === 'audio') {
                const audio = document.createElement('audio');
                audio.controls = true;
                audio.className = 'w-full';
                audio.src = URL.createObjectURL(data);
                content.appendChild(audio);
            } else if (type === 'pdf') {
                const iframe = document.createElement('iframe');
                iframe.src = URL.createObjectURL(data);
                iframe.className = 'w-full h-[70vh]';
                content.appendChild(iframe);
            } else {
                content.innerHTML = `
                    <div class="text-center p-8">
                        <i class="fas fa-file-alt text-4xl mb-4"></i>
                        <p>Preview not available for this file type</p>
                        <p class="text-sm text-gray-500 mt-2">Click the download button to access the file</p>
                    </div>
                `;
            }
        })
        .catch(error => {
            content.innerHTML = `<div class="error-message">${error.message}</div>`;
        });
}

// File deletion
function deleteFile(fileId) {
    if (!confirm('Are you sure you want to delete this file?')) return;

    const formData = new FormData();
    formData.append('device_info', JSON.stringify(deviceInfo));

    fetch(`/delete/${fileId}`, {
        method: 'POST',
        body: formData
    })
    .then(response => {
        if (!response.ok) throw new Error('Deletion failed');
        // Remove the row from the table
        const row = document.querySelector(`tr[data-file-id="${fileId}"]`);
        if (row) {
            row.remove();
        }
    })
    .catch(error => {
        console.error('Delete failed:', error);
        alert('Failed to delete file: ' + error.message);
    });
}

// Theme switcher
document.querySelector('.theme-controller').addEventListener('change', (e) => {
    document.documentElement.setAttribute('data-theme', e.target.checked ? 'dark' : 'light');
}); 

// --- Begin code moved from index.html ---
let currentPreviewFile = '';
let socket = io();
let deviceInfo = {
    name: navigator.userAgent,
    platform: navigator.platform
};

// Register service worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/static/js/service-worker.js')
            .then(registration => {
                console.log('ServiceWorker registration successful');
            })
            .catch(err => {
                console.log('ServiceWorker registration failed: ', err);
            });
    });
}

// Handle WebSocket events
socket.on('connect', () => {
    console.log('Connected to WebSocket server');
});

socket.on('file_available', (data) => {
    console.log('New file available:', data);
    addFileToTable(data);
});

socket.on('file_deleted', (data) => {
    console.log('File deleted:', data);
    removeFileFromTable(data.file_id);
});

socket.on('file_data', (data) => {
    console.log('File data received:', data);
    // Handle direct file transfer
    downloadFileFromData(data);
});

socket.on('file_error', (data) => {
    console.error('File error:', data.error);
    alert('File error: ' + data.error);
});

// Helper functions for dynamic table management
function addFileToTable(fileData) {
    const tableBody = document.getElementById('filesTableBody');
    const row = document.createElement('tr');
    row.setAttribute('data-file-id', fileData.file_id);
    
    const iconClass = getFileIcon(fileData.file_type);
    
    row.innerHTML = `
        <td class="flex items-center">
            <i class="fas ${iconClass} file-icon"></i>
            ${fileData.filename}
        </td>
        <td>
            <span class="file-type-badge type-${fileData.file_type} text-white">
                ${fileData.file_type}
            </span>
        </td>
        <td>${fileData.size}</td>
        <td>
            <div class="flex gap-2">
                <button onclick="previewFile('${fileData.file_id}', '${fileData.file_type}')" class="btn btn-sm btn-primary btn-animated">
                    <i class="fas fa-eye mr-1"></i> Preview
                </button>
                <a href="/download/${fileData.file_id}" class="btn btn-sm btn-secondary btn-animated">
                    <i class="fas fa-download mr-1"></i> Download
                </a>
                <button onclick="deleteFile('${fileData.file_id}')" class="btn btn-sm btn-error btn-animated">
                    <i class="fas fa-trash-alt mr-1"></i> Delete
                </button>
            </div>
        </td>
    `;
    
    tableBody.appendChild(row);
}

function removeFileFromTable(fileId) {
    const row = document.querySelector(`tr[data-file-id="${fileId}"]`);
    if (row) {
        row.remove();
    }
}

function getFileIcon(fileType) {
    const iconMap = {
        'image': 'fa-image',
        'video': 'fa-video',
        'audio': 'fa-music',
        'document': 'fa-file-alt',
        'code': 'fa-code',
        'text': 'fa-file-text',
        'archive': 'fa-file-archive',
        'executable': 'fa-cog',
        'folder': 'fa-folder',
        'other': 'fa-file'
    };
    return iconMap[fileType] || 'fa-file';
}

function downloadFileFromData(data) {
    // Convert base64 content to blob and trigger download
    const byteCharacters = atob(data.content);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: data.mime_type });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = data.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Modified upload function for direct sharing
function uploadFile(file, path, isFolder = false) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('device_info', JSON.stringify(deviceInfo));
    
    fetch('/upload', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            console.log('File uploaded successfully:', data);
            // File will be added to table via WebSocket event
        } else {
            alert(data.error || 'Upload failed');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        alert('Upload failed');
    });
}

// --- End code moved from index.html ---