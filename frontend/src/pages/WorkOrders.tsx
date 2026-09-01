import React, { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, Select, message, DatePicker, Upload } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, UserAddOutlined, PaperClipOutlined, UploadOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { io, Socket } from 'socket.io-client';
import api from '../api';
import { useAuth } from '../contexts/AuthContext';

const { Option } = Select;
const { RangePicker } = DatePicker;

interface WorkOrder {
  id: string;
  title: string;
  description: string;
  status: string;
  created_at: string;
  technician_id?: string;
  scheduled_range?: [string, string];
}

interface Technician {
  id: string;
  email: string;
}

const WorkOrders: React.FC = () => {
  const queryClient = useQueryClient();
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10 });
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const [editingOrder, setEditingOrder] = useState<WorkOrder | null>(null);
  const [form] = Form.useForm();

  const [assignModalVisible, setAssignModalVisible] = useState<boolean>(false);
  const [assigningOrder, setAssigningOrder] = useState<WorkOrder | null>(null);
  const [assignForm] = Form.useForm();
  
  const [progressModalVisible, setProgressModalVisible] = useState<boolean>(false);
  const [progressForm] = Form.useForm();
  const [progressEventId, setProgressEventId] = useState<string>('');

  const [attachmentsModalVisible, setAttachmentsModalVisible] = useState<boolean>(false);
  const [activeWorkOrderForFiles, setActiveWorkOrderForFiles] = useState<WorkOrder | null>(null);

  const { data: attachments = [], refetch: refetchAttachments } = useQuery({
    queryKey: ['attachments', activeWorkOrderForFiles?.id],
    queryFn: async () => {
      if (!activeWorkOrderForFiles) return [];
      const response = await api.get(`/attachments?work_order_id=${activeWorkOrderForFiles.id}`);
      return response.data;
    },
    enabled: !!activeWorkOrderForFiles
  });


  const { data: workOrdersData, isLoading: loading, isError: error } = useQuery({
    queryKey: ['workOrders', pagination.current, pagination.pageSize, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams({
        current: pagination.current.toString(),
        pageSize: pagination.pageSize.toString()
      });
      if (statusFilter) params.append('status', statusFilter);
      const response = await api.get(`/work-orders?${params.toString()}`);
      return response.data;
    }
  });

  const { data: technicians = [] } = useQuery<Technician[]>({
    queryKey: ['technicians'],
    queryFn: async () => {
      const response = await api.get('/technicians');
      return response.data;
    }
  });

  const workOrders = workOrdersData?.data || [];
  const total = workOrdersData?.total || 0;

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    const socket: Socket = io(import.meta.env.VITE_API_URL || 'http://localhost:8000', {
      auth: { token },
      path: '/socket.io'
    });

    socket.on('connect', () => {
      console.log('Socket connected');
    });

    socket.on('work_order_updated', () => {
      queryClient.invalidateQueries({ queryKey: ['workOrders'] });
    });

    return () => {
      socket.disconnect();
    };
  }, [queryClient]);

  const handleTableChange = (newPagination: any, filters: any) => {
    setPagination(newPagination);
    const newStatus = filters.status ? filters.status[0] : null;
    setStatusFilter(newStatus);
  };

  const handleCreate = () => {
    setEditingOrder(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (record: WorkOrder) => {
    setEditingOrder(record);
    form.setFieldsValue(record);
    setModalVisible(true);
  };
  
  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/work-orders/${id}`);
      message.success('Work order deleted');
      queryClient.invalidateQueries({ queryKey: ['workOrders'] });
    } catch (err: any) {
      message.error(err.response?.data?.error || 'Failed to delete work order');
    }
  };

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();
      if (editingOrder) {
        await api.patch(`/work-orders/${editingOrder.id}`, values);
        message.success('Work order updated');
      } else {
        await api.post('/work-orders', values);
        message.success('Work order created');
      }
      setModalVisible(false);
      queryClient.invalidateQueries({ queryKey: ['workOrders'] });
    } catch (err: any) {
      if (err.response?.data?.error) {
         message.error(err.response.data.error);
      } else if (err.errorFields) {
         // Form validation error
      } else {
         message.error('Operation failed');
      }
    }
  };

  const handleAssignClick = (record: WorkOrder) => {
    setAssigningOrder(record);
    assignForm.resetFields();
    setAssignModalVisible(true);
  };

  const handleAssignOk = async () => {
    try {
      const values = await assignForm.validateFields();
      if (assigningOrder) {
        const payload = {
          technician_id: values.technician_id,
          scheduled_start: values.scheduled_range[0].toISOString(),
          scheduled_end: values.scheduled_range[1].toISOString(),
        };
        await api.post(`/work-orders/${assigningOrder.id}/assign`, payload);
        message.success('Technician assigned successfully');
        setAssignModalVisible(false);
        queryClient.invalidateQueries({ queryKey: ['workOrders'] });
      }
    } catch (err: any) {
      if (err.response?.status === 409) {
        message.error('Conflict: ' + err.response.data.error);
      } else if (err.response?.data?.error) {
         message.error(err.response.data.error);
      } else if (err.errorFields) {
         // Validation
      } else {
         message.error('Assignment failed');
      }
    }
  };

  const handleProgressClick = (record: WorkOrder) => {
    setAssigningOrder(record);
    progressForm.resetFields();
    setProgressEventId(crypto.randomUUID());
    setProgressModalVisible(true);
  };

  const handleProgressOk = async () => {
    try {
      const values = await progressForm.validateFields();
      if (assigningOrder) {
        const payload = {
          event_id: progressEventId,
          status_to: values.status_to,
        };
        await api.post(`/work-orders/${assigningOrder.id}/progress`, payload);
        message.success('Progress event submitted successfully');
        setProgressModalVisible(false);
        queryClient.invalidateQueries({ queryKey: ['workOrders'] });
      }
    } catch (err: any) {
      if (err.response?.data?.error) {
         message.error(err.response.data.error);
      } else if (err.errorFields) {
         // Validation
      } else {
         message.error('Failed to submit progress event');
      }
    }
  };

  const handleAttachmentsClick = (record: WorkOrder) => {
    setActiveWorkOrderForFiles(record);
    setAttachmentsModalVisible(true);
  };

  const { user } = useAuth();

  const columns = [
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      filters: [
        { text: 'Open', value: 'open' },
        { text: 'Assigned', value: 'assigned' },
        { text: 'In Progress', value: 'in_progress' },
        { text: 'On Hold', value: 'on_hold' },
        { text: 'Completed', value: 'completed' },
        { text: 'Cancelled', value: 'cancelled' },
      ],
      filterMultiple: false,
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
    },
    {
      title: 'Created At',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (text: string) => new Date(text).toLocaleString(),
    },
    {
      title: 'Technician',
      dataIndex: 'technician_id',
      key: 'technician_id',
      render: (id: string) => {
        const tech = technicians.find(t => t.id === id);
        return tech ? tech.email : 'Unassigned';
      }
    },
    {
      title: 'Scheduled Range',
      dataIndex: 'scheduled_range',
      key: 'scheduled_range',
      render: (range: [string, string]) => range ? `${new Date(range[0]).toLocaleString()} - ${new Date(range[1]).toLocaleString()}` : 'N/A'
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, record: WorkOrder) => (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <Button icon={<UserAddOutlined />} onClick={() => handleAssignClick(record)}>
            Assign
          </Button>
          <Button icon={<PaperClipOutlined />} onClick={() => handleAttachmentsClick(record)}>
            Files
          </Button>
          {user?.id === record.technician_id && (
            <Button onClick={() => handleProgressClick(record)}>
              Progress
            </Button>
          )}
          <Button icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            Edit
          </Button>
          <Button danger icon={<DeleteOutlined />} onClick={() => handleDelete(record.id)}>
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
        <h2>Work Orders</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
          Create Work Order
        </Button>
      </div>
      
      <Table
        dataSource={workOrders}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={{ ...pagination, total }}
        onChange={handleTableChange}
        locale={{ emptyText: error ? 'Error loading data' : 'No work orders found' }}
      />

      <Modal
        title={editingOrder ? 'Edit Work Order' : 'Create Work Order'}
        open={modalVisible}
        onOk={handleModalOk}
        onCancel={() => setModalVisible(false)}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="title"
            label="Title"
            rules={[{ required: true, message: 'Please input the title!' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="description"
            label="Description"
          >
            <Input.TextArea rows={4} />
          </Form.Item>
          <Form.Item
            name="status"
            label="Status"
            initialValue="open"
          >
            <Select>
              <Option value="open">Open</Option>
              <Option value="assigned">Assigned</Option>
              <Option value="in_progress">In Progress</Option>
              <Option value="on_hold">On Hold</Option>
              <Option value="completed">Completed</Option>
              <Option value="cancelled">Cancelled</Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`Assign Technician to ${assigningOrder?.title}`}
        open={assignModalVisible}
        onOk={handleAssignOk}
        onCancel={() => setAssignModalVisible(false)}
        destroyOnClose
      >
        <Form form={assignForm} layout="vertical">
          <Form.Item
            name="technician_id"
            label="Technician"
            rules={[{ required: true, message: 'Please select a technician!' }]}
          >
            <Select placeholder="Select a technician">
              {technicians.map(tech => (
                <Option key={tech.id} value={tech.id}>{tech.email}</Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            name="scheduled_range"
            label="Scheduled Range"
            rules={[{ required: true, message: 'Please select the scheduled range!' }]}
          >
            <RangePicker showTime style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`Submit Progress Event for ${assigningOrder?.title}`}
        open={progressModalVisible}
        onOk={handleProgressOk}
        onCancel={() => setProgressModalVisible(false)}
        destroyOnClose
      >
        <Form form={progressForm} layout="vertical">
          <Form.Item
            name="status_to"
            label="New Status"
            rules={[{ required: true, message: 'Please select a status!' }]}
          >
            <Select placeholder="Select a status">
              <Option value="in_progress">In Progress</Option>
              <Option value="on_hold">On Hold</Option>
              <Option value="completed">Completed</Option>
              <Option value="cancelled">Cancelled</Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`Files for ${activeWorkOrderForFiles?.title}`}
        open={attachmentsModalVisible}
        onCancel={() => setAttachmentsModalVisible(false)}
        footer={null}
        destroyOnClose
        width={600}
      >
        <Upload
          name="file"
          action={`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/attachments`}
          headers={{
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          }}
          data={{
            work_order_id: activeWorkOrderForFiles?.id || '',
          }}
          onChange={(info) => {
            if (info.file.status === 'done') {
              message.success(`${info.file.name} uploaded successfully`);
              refetchAttachments();
            } else if (info.file.status === 'error') {
              message.error(info.file.response?.error || `${info.file.name} upload failed.`);
            }
          }}
          showUploadList={false}
        >
          <Button icon={<UploadOutlined />} type="primary">Upload File</Button>
        </Upload>
        
        <Table
          dataSource={attachments}
          rowKey="id"
          style={{ marginTop: 16 }}
          pagination={false}
          columns={[
            {
              title: 'Name',
              dataIndex: 'file_name',
              key: 'file_name',
            },
            {
              title: 'Size',
              dataIndex: 'file_size',
              key: 'file_size',
              render: (size: number) => `${(size / 1024).toFixed(1)} KB`
            },
            {
              title: 'Action',
              key: 'action',
              render: (_, record: any) => (
                <Button 
                  type="link" 
                  onClick={() => {
                    const token = localStorage.getItem('token');
                    fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/attachments/${record.id}/download`, {
                      headers: { Authorization: `Bearer ${token}` }
                    })
                    .then(res => {
                        if (!res.ok) throw new Error('Download failed');
                        return res.blob();
                    })
                    .then(blob => {
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = record.file_name;
                        document.body.appendChild(a);
                        a.click();
                        window.URL.revokeObjectURL(url);
                        document.body.removeChild(a);
                    })
                    .catch(() => message.error('Download failed'));
                  }}
                >
                  Download
                </Button>
              )
            }
          ]}
        />
      </Modal>
    </div>
  );
};

export default WorkOrders;
