import React, { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, Select, message, DatePicker } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, UserAddOutlined } from '@ant-design/icons';
import api from '../api';

const { Option } = Select;
const { RangePicker } = DatePicker;

interface WorkOrder {
  id: string;
  title: string;
  description: string;
  status: string;
  created_at: string;
  technician_id?: string;
  scheduled_time?: [string, string];
}

interface Technician {
  id: string;
  email: string;
}

const WorkOrders: React.FC = () => {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<boolean>(false);
  
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10 });
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const [editingOrder, setEditingOrder] = useState<WorkOrder | null>(null);
  const [form] = Form.useForm();

  const [assignModalVisible, setAssignModalVisible] = useState<boolean>(false);
  const [assigningOrder, setAssigningOrder] = useState<WorkOrder | null>(null);
  const [assignForm] = Form.useForm();
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  
  const fetchWorkOrders = async (current: number = pagination.current, pageSize: number = pagination.pageSize, status: string | null = statusFilter) => {
    setLoading(true);
    setError(false);
    try {
      const params = new URLSearchParams({
        current: current.toString(),
        pageSize: pageSize.toString()
      });
      if (status) params.append('status', status);

      const response = await api.get(`/work-orders?${params.toString()}`);
      setWorkOrders(response.data.data);
      setTotal(response.data.total);
    } catch (error: any) {
      setError(true);
      message.error(error.response?.data?.error || 'Failed to load work orders');
    } finally {
      setLoading(false);
    }
  };

  const fetchTechnicians = async () => {
    try {
      const response = await api.get('/technicians');
      setTechnicians(response.data);
    } catch (error) {
      console.error("Failed to load technicians", error);
    }
  };

  useEffect(() => {
    fetchWorkOrders(pagination.current, pagination.pageSize, statusFilter);
    fetchTechnicians();
  }, [pagination.current, pagination.pageSize, statusFilter]);

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
      fetchWorkOrders();
    } catch (error: any) {
      message.error(error.response?.data?.error || 'Failed to delete work order');
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
      fetchWorkOrders();
    } catch (error: any) {
      if (error.response?.data?.error) {
         message.error(error.response.data.error);
      } else if (error.errorFields) {
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
          scheduled_start: values.scheduled_time[0].toISOString(),
          scheduled_end: values.scheduled_time[1].toISOString(),
        };
        await api.post(`/work-orders/${assigningOrder.id}/assign`, payload);
        message.success('Technician assigned successfully');
        setAssignModalVisible(false);
        fetchWorkOrders();
      }
    } catch (error: any) {
      if (error.response?.status === 409) {
        message.error('Conflict: ' + error.response.data.error);
      } else if (error.response?.data?.error) {
         message.error(error.response.data.error);
      } else if (error.errorFields) {
         // Validation
      } else {
         message.error('Assignment failed');
      }
    }
  };

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
      title: 'Actions',
      key: 'actions',
      render: (_: any, record: WorkOrder) => (
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button icon={<UserAddOutlined />} onClick={() => handleAssignClick(record)}>
            Assign
          </Button>
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
            name="scheduled_time"
            label="Scheduled Time"
            rules={[{ required: true, message: 'Please select the scheduled time!' }]}
          >
            <RangePicker showTime style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default WorkOrders;
