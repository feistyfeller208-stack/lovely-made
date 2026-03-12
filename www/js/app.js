// Main app namespace
const PersonalAssistant = {
    db: null,
    files: [],
    notifications: [],
    
    init: async function() {
        console.log('Starting Personal Assistant...');
        
        // Initialize storage
        this.db = await this.initDatabase();
        
        // Check permissions
        await this.checkPermissions();
        
        // Start background services
        this.startFileIndexing();
        this.startNotificationTracking();
        
        // Setup UI listeners
        this.setupEventListeners();
    },
    
    initDatabase: function() {
        return localforage.createInstance({
            name: 'personalAssistant',
            storeName: 'assistant_data'
        });
    },
    
    checkPermissions: async function() {
        // For Median.co, we use Cordova plugins
        if (window.cordova) {
            // Request storage permission
            cordova.plugins.permissions.requestPermission(
                cordova.plugins.permissions.READ_EXTERNAL_STORAGE,
                (status) => {
                    if (status.hasPermission) {
                        this.scanFiles();
                    }
                }
            );
        }
    },
    
    startFileIndexing: function() {
        // Run every hour
        setInterval(() => {
            this.scanFiles();
        }, 3600000);
        
        // Initial scan
        this.scanFiles();
    },
    
    scanFiles: function() {
        if (!window.cordova) return;
        
        window.resolveLocalFileSystemURL(
            cordova.file.externalRootDirectory,
            (dir) => {
                this.readDirectoryRecursive(dir, (file) => {
                    this.indexFile(file);
                });
            }
        );
    },
    
    readDirectoryRecursive: function(dir, callback) {
        const reader = dir.createReader();
        reader.readEntries((entries) => {
            entries.forEach((entry) => {
                if (entry.isDirectory) {
                    this.readDirectoryRecursive(entry, callback);
                } else {
                    callback(entry);
                }
            });
        });
    },
    
    indexFile: function(fileEntry) {
        fileEntry.file((file) => {
            const fileInfo = {
                name: file.name,
                path: fileEntry.nativeURL,
                size: file.size,
                lastModified: file.lastModified,
                type: this.getFileType(file.name),
                content: '',
                indexed: Date.now()
            };
            
            // For text files, read content
            if (this.isTextFile(file.name)) {
                this.readFileContent(fileEntry, (content) => {
                    fileInfo.content = content.substring(0, 5000); // First 5000 chars
                    this.db.setItem(fileInfo.path, fileInfo);
                });
            } else {
                this.db.setItem(fileInfo.path, fileInfo);
            }
        });
    },
    
    readFileContent: function(fileEntry, callback) {
        fileEntry.file((file) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                callback(reader.result);
            };
            reader.readAsText(file);
        });
    },
    
    isTextFile: function(filename) {
        const textExts = ['.txt', '.md', '.json', '.xml', '.html', '.css', '.js'];
        return textExts.some(ext => filename.toLowerCase().endsWith(ext));
    },
    
    getFileType: function(filename) {
        if (filename.match(/\.(jpg|jpeg|png|gif|bmp)$/i)) return 'image';
        if (filename.match(/\.(mp3|wav|ogg|m4a)$/i)) return 'audio';
        if (filename.match(/\.(mp4|avi|mkv|mov)$/i)) return 'video';
        if (filename.match(/\.(pdf)$/i)) return 'pdf';
        if (filename.match(/\.(doc|docx)$/i)) return 'document';
        if (filename.match(/\.(txt|md)$/i)) return 'text';
        return 'other';
    },
    
    // Search functionality
    search: async function(query) {
        const results = [];
        await this.db.iterate((value, key) => {
            if (value.name.toLowerCase().includes(query.toLowerCase()) ||
                (value.content && value.content.toLowerCase().includes(query.toLowerCase()))) {
                results.push(value);
            }
        });
        return results.slice(0, 20);
    },
    
    // Smart reminders based on notifications
    setupEventListeners: function() {
        document.getElementById('searchInput')?.addEventListener('input', (e) => {
            this.handleSearch(e.target.value);
        });
        
        document.getElementById('askButton')?.addEventListener('click', () => {
            this.processQuery(document.getElementById('queryInput').value);
        });
    },
    
    processQuery: async function(query) {
        query = query.toLowerCase();
        
        // Simple pattern matching
        if (query.includes('file') && query.includes('from last month')) {
            this.findFilesFromLastMonth();
        } else if (query.includes('unread messages') || query.includes('unreplied')) {
            this.checkUnrepliedMessages();
        } else if (query.includes('playlist') || query.includes('music')) {
            this.suggestPlaylist();
        } else {
            // Default to file search
            const results = await this.search(query);
            this.displayResults(results);
        }
    },
    
    findFilesFromLastMonth: function() {
        const oneMonthAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
        const results = [];
        
        this.db.iterate((value, key) => {
            if (value.lastModified > oneMonthAgo) {
                results.push(value);
            }
        }).then(() => {
            this.displayResults(results);
        });
    },
    
    displayResults: function(results) {
        const container = document.getElementById('results');
        container.innerHTML = results.map(r => `
            <div class="result-item" onclick="PersonalAssistant.openFile('${r.path}')">
                <h3>${r.name}</h3>
                <p>${r.path}</p>
                <small>Modified: ${new Date(r.lastModified).toLocaleDateString()}</small>
            </div>
        `).join('');
    },
    
    openFile: function(path) {
        if (window.cordova) {
            cordova.plugins.fileOpener2.open(path);
        }
    }
};

// Start when ready
document.addEventListener('deviceready', () => {
    PersonalAssistant.init();
});

// Also for web testing
if (!window.cordova) {
    document.addEventListener('DOMContentLoaded', () => {
        PersonalAssistant.init();
    });
}
