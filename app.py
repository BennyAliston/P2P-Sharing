import os
from flask import Flask, render_template, request, send_from_directory, jsonify, send_file, Response
from werkzeug.utils import secure_filename
import mimetypes
from PIL import Image
import io
import re
from pathlib import Path
import shutil
from datetime import datetime
from flask_socketio import SocketIO, emit
import json
import base64
import uuid
import threading
import time

app = Flask(__name__)
app.secret_key = os.urandom(24)
socketio = SocketIO(app, cors_allowed_origins="*")

# In-memory file storage for direct sharing
active_transfers = {}
file_metadata = {}

# Supported preview file types with MIME type validation
PREVIEW_TYPES = {
    'image': {
        'extensions': ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.ico'],
        'mime_types': ['image/jpeg', 'image/png', 'image/gif', 'image/bmp', 'image/webp', 'image/svg+xml', 'image/x-icon']
    },
    'video': {
        'extensions': ['.mp4', '.webm', '.ogg', '.avi', '.mov', '.mkv', '.flv', '.wmv'],
        'mime_types': ['video/mp4', 'video/webm', 'video/ogg', 'video/x-msvideo', 'video/quicktime', 'video/x-matroska', 'video/x-flv', 'video/x-ms-wmv']
    },
    'audio': {
        'extensions': ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac'],
        'mime_types': ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/flac', 'audio/aac']
    },
    'document': {
        'extensions': ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'],
        'mime_types': ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                      'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation']
    },
    'code': {
        'extensions': ['.py', '.js', '.html', '.css', '.json', '.xml', '.java', '.cpp', '.c', '.cs', '.php', '.rb', '.go', '.ts', '.jsx', '.tsx'],
        'mime_types': ['text/x-python', 'text/javascript', 'text/html', 'text/css', 'application/json', 'text/xml', 
                      'text/x-java', 'text/x-c++', 'text/x-c', 'text/x-csharp', 'text/x-php', 'text/x-ruby', 'text/x-go', 'text/typescript']
    },
    'text': {
        'extensions': ['.txt', '.md', '.csv', '.log', '.ini', '.conf', '.yml', '.yaml'],
        'mime_types': ['text/plain', 'text/markdown', 'text/csv']
    },
    'archive': {
        'extensions': ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2'],
        'mime_types': ['application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed', 
                      'application/x-tar', 'application/gzip', 'application/x-bzip2']
    },
    'executable': {
        'extensions': ['.exe', '.msi', '.app', '.dmg', '.deb', '.rpm'],
        'mime_types': ['application/x-msdownload', 'application/x-msi', 'application/x-executable']
    }
}

def get_file_type(filename):
    """Determine the type of file based on its extension"""
    if not filename:
        return 'other'
        
    ext = os.path.splitext(filename)[1].lower()
    
    # Check if it's a directory
    if not ext and os.path.isdir(os.path.join(app.config['UPLOAD_FOLDER'], filename)):
        return 'folder'
        
    # Check file extension against known types
    for file_type, info in PREVIEW_TYPES.items():
        if ext in info['extensions']:
            return file_type
            
    # Try to guess based on mime type
    mime_type = mimetypes.guess_type(filename)[0]
    if mime_type:
        for file_type, info in PREVIEW_TYPES.items():
            if mime_type in info['mime_types']:
                return file_type
                
    return 'other'

def get_file_icon(file_type):
    """Get the appropriate icon class for the file type"""
    icon_map = {
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
    }
    return icon_map.get(file_type, 'fa-file')


def format_file_size(size):
    """Format file size in human-readable format"""
    try:
        size = float(size)  # Ensure size is a number
        for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
            if size < 1024.0:
                return f"{size:.2f} {unit}"
            size /= 1024.0
        return f"{size:.2f} TB"
    except (ValueError, TypeError):
        return "0 B"  # Return a default value if size is invalid


@app.route('/')
def index():
    try:
        # Get files from in-memory storage
        file_info = []
        for file_id, metadata in file_metadata.items():
            file_info.append({
                'name': metadata['filename'],
                'type': metadata['file_type'],
                'icon': get_file_icon(metadata['file_type']),
                'size': format_file_size(metadata['size']),
                'mime_type': metadata['mime_type'],
                'file_id': file_id
            })
        return render_template('index.html', files=file_info)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@socketio.on('connect')
def handle_connect():
    print('Client connected')
    # Send current files to newly connected client
    for file_id, metadata in file_metadata.items():
        emit('file_available', {
            'file_id': file_id,
            'filename': metadata['filename'],
            'file_type': metadata['file_type'],
            'size': format_file_size(metadata['size']),
            'device_info': metadata['device_info']
        })

@socketio.on('disconnect')
def handle_disconnect():
    print('Client disconnected')

@socketio.on('request_file')
def handle_file_request(data):
    file_id = data.get('file_id')
    if file_id in file_metadata:
        metadata = file_metadata[file_id]
        emit('file_data', {
            'file_id': file_id,
            'filename': metadata['filename'],
            'content': metadata['content'],
            'mime_type': metadata['mime_type']
        })
    else:
        emit('file_error', {'error': 'File not found'})


@app.route('/upload', methods=['POST'])
def upload_file():
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['file']
        device_info = request.form.get('device_info', 'Unknown Device')
        
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400

        # Read file content into memory
        file_content = file.read()
        file_size = len(file_content)
        
        if file_size == 0:
            return jsonify({'error': 'Empty file'}), 400
        
        # Generate unique file ID
        file_id = str(uuid.uuid4())
        
        # Store file metadata
        file_type = get_file_type(file.filename)
        mime_type = mimetypes.guess_type(file.filename)[0] or 'application/octet-stream'
        
        file_metadata[file_id] = {
            'filename': file.filename,
            'file_type': file_type,
            'mime_type': mime_type,
            'size': file_size,
            'content': base64.b64encode(file_content).decode('utf-8'),
            'created_at': datetime.now().isoformat(),
            'device_info': device_info
        }
        
        # Broadcast to all connected clients
        socketio.emit('file_available', {
            'file_id': file_id,
            'filename': file.filename,
            'file_type': file_type,
            'size': format_file_size(file_size),
            'device_info': device_info
        })
        
        return jsonify({
            'success': True,
            'file_id': file_id,
            'filename': file.filename,
            'type': file_type
        })
                
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/download/<file_id>')
def download_file(file_id):
    try:
        if file_id not in file_metadata:
            return jsonify({'error': 'File not found'}), 404
            
        metadata = file_metadata[file_id]
        file_content = base64.b64decode(metadata['content'])
        
        return Response(
            file_content,
            mimetype=metadata['mime_type'],
            headers={
                'Content-Disposition': f'attachment; filename="{metadata["filename"]}"',
                'Content-Length': str(metadata['size'])
            }
        )
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/file-info/<file_id>')
def file_info(file_id):
    try:
        if file_id not in file_metadata:
            return jsonify({'error': 'File not found'}), 404
            
        metadata = file_metadata[file_id]
        
        return jsonify({
            'name': metadata['filename'],
            'type': metadata['file_type'],
            'mime_type': metadata['mime_type'],
            'size': format_file_size(metadata['size']),
            'created': metadata['created_at'],
            'device_info': metadata['device_info']
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/preview/<file_id>')
def preview_file(file_id):
    try:
        if file_id not in file_metadata:
            return jsonify({'error': 'File not found'}), 404
            
        metadata = file_metadata[file_id]
        file_content = base64.b64decode(metadata['content'])
        
        if metadata['file_type'] == 'text' or metadata['file_type'] == 'code':
            try:
                content = file_content.decode('utf-8')
                return jsonify({
                    'content': content, 
                    'type': metadata['file_type'], 
                    'info': {
                        'name': metadata['filename'],
                        'type': metadata['file_type'],
                        'mime_type': metadata['mime_type'],
                        'size': format_file_size(metadata['size']),
                        'created': metadata['created_at']
                    }
                })
            except UnicodeDecodeError:
                return jsonify({'error': 'File contains binary data and cannot be previewed as text'}), 400
        else:
            return Response(
                file_content,
                mimetype=metadata['mime_type'],
                headers={'Content-Disposition': f'inline; filename="{metadata["filename"]}"'}
            )
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/delete/<file_id>', methods=['POST'])
def delete_file(file_id):
    try:
        if file_id not in file_metadata:
            return jsonify({'error': 'File not found'}), 404
            
        device_info = request.form.get('device_info', 'Unknown Device')
        filename = file_metadata[file_id]['filename']
        
        # Remove from memory
        del file_metadata[file_id]
        
        # Broadcast deletion to all clients
        socketio.emit('file_deleted', {
            'file_id': file_id,
            'filename': filename,
            'device_info': device_info
        })
        
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    socketio.run(app, debug=True, host='0.0.0.0', port=5000) 