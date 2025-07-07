import { defineStore } from 'pinia';
import api from '@/api';

export const useFileStore = defineStore('file', {
  state: () => ({
    files: [],
    isLoading: false,
    error: null,
    uploadProgress: 0
  }),
  
  actions: {
    async uploadFile(formData) {
      try {
        this.isLoading = true;
        this.uploadProgress = 0;

        const response = await api.files.uploadFile(formData);
        console.log('文件上传成功:', response);
        return response;
      } catch (error) {
        console.error('上传文件失败:', error);
        this.error = error.response?.data?.message || error.message;
        throw error;
      } finally {
        this.isLoading = false;
      }
    },
    
    async getFiles(toolType) {
      try {
        this.isLoading = true;
        const response = await api.files.getFiles(toolType);
        this.files = response.data || [];
        return response;
      } catch (error) {
        console.error('获取文件列表失败:', error);
        this.error = error.response?.data?.message || error.message;
        throw error;
      } finally {
        this.isLoading = false;
      }
    },
    
    async deleteFile(fileId) {
      try {
        this.isLoading = true;
        const response = await api.files.deleteFile(fileId);
        // 删除成功后更新本地文件列表
        this.files = this.files.filter(file => file.id !== fileId);
        return response;
      } catch (error) {
        console.error('删除文件失败:', error);
        this.error = error.response?.data?.message || error.message;
        throw error;
      } finally {
        this.isLoading = false;
      }
    },
    
    async downloadFile(fileId) {
      try {
        this.isLoading = true;
        const response = await api.files.downloadFile(fileId);
        return response;
      } catch (error) {
        console.error('下载文件失败:', error);
        this.error = error.response?.data?.message || error.message;
        throw error;
      } finally {
        this.isLoading = false;
      }
    },

    async getFileContent(fileId) {
      try {
        this.isLoading = true;
        const response = await api.files.getFileContent(fileId);
        return response;
      } catch (error) {
        console.error('获取文件内容失败:', error);
        this.error = error.response?.data?.message || error.message;
        throw error;
      } finally {
        this.isLoading = false;
      }
    }
  }
});